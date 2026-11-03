package service

import (
	"context"
	"math"
	"strings"
	"time"
	"unicode/utf8"
)

// 独立状态模块：红色为账号异常/检测失败，黄色为答错，绿色为正常，灰色为尚未检测。
// 此聚合只读，固定出口与自动停调规则不由它负责。
const (
	AccountStatusCheckStateDead     = "dead"     // red: the account itself is broken or expired
	AccountStatusCheckStateError    = "error"    // red: the latest check failed to answer
	AccountStatusCheckStateDegraded = "degraded" // yellow: the latest answer was wrong
	AccountStatusCheckStateNormal   = "normal"   // green: the latest answer was 21
	AccountStatusCheckStateUnknown  = "unknown"  // grey: no check result yet

	accountStatusCheckStatusMaxAccounts = 200
	accountStatusCheckHistorySize       = 15
	accountStatusCheckAnswerHintRunes   = 32
	// The official runner saves a wrong built-in candy answer as a failed result
	// with this message (RunPelicanBackground); it is a degraded answer, not an error.
	accountStatusCheckAnswerMismatch = "answer_mismatch"
)

// AccountStatusCheckStatusRow joins a stored row with the account fields the
// status needs.
type AccountStatusCheckStatusRow struct {
	AccountID              int64
	InheritedFromAccountID *int64
	EffectiveModel         string
	Config                 AccountStatusCheckConfig
	Platform               string
	AccountStatus          string
	ExpiresAt              *time.Time
	AutoPauseOnExpired     bool
}

// AccountStatusCheckResult is the part of an official scheduled test result the
// status reads.
type AccountStatusCheckResult struct {
	ID           int64
	PlanID       int64
	Status       string
	ResponseText string
	ErrorMessage string
	LatencyMs    int64
	StartedAt    time.Time
}

type AccountStatusCheckStatusItem struct {
	InheritedFromAccountID *int64                    `json:"inherited_from_account_id"`
	AccountID              int64                     `json:"account_id"`
	Enabled                bool                      `json:"enabled"`
	State                  string                    `json:"state"`
	Latest                 *AccountStatusCheckLatest `json:"latest"`
	History                []string                  `json:"history"`
	Matched                int                       `json:"matched"`
	Completed              int                       `json:"completed"`
	Rate                   *float64                  `json:"rate"`
	Model                  string                    `json:"model"`
	ReasoningEffort        string                    `json:"reasoning_effort"`
	IntervalMinutes        int                       `json:"interval_minutes"`
	CheckEnabled           bool                      `json:"check_enabled"`
}

type AccountStatusCheckLatest struct {
	Status     string    `json:"status"` // normal | degraded | error
	Matched    bool      `json:"matched"`
	AnswerHint string    `json:"answer_hint"`
	LatencyMs  int64     `json:"latency_ms"`
	StartedAt  time.Time `json:"started_at"`
}

// Status 两次批量只读查询覆盖所有 OpenAI 账号；未初始化/无结果仍返回灰色状态，影子复用母账号历史。
func (s *AccountStatusCheckService) Status(ctx context.Context, accountIDs []int64) ([]AccountStatusCheckStatusItem, error) {
	if len(accountIDs) > accountStatusCheckStatusMaxAccounts {
		return nil, accountStatusCheckInvalid("at most %d account_ids", accountStatusCheckStatusMaxAccounts)
	}
	items := []AccountStatusCheckStatusItem{}
	if len(accountIDs) == 0 {
		return items, nil
	}
	rows, err := s.store.ListStatus(ctx, accountIDs)
	if err != nil {
		return nil, err
	}
	byAccount := make(map[int64]AccountStatusCheckStatusRow, len(rows))
	planIDs := make([]int64, 0, len(rows))
	for _, row := range rows {
		byAccount[row.AccountID] = row
		if row.Config.PlanID != nil {
			planIDs = append(planIDs, *row.Config.PlanID)
		}
	}
	results := map[int64][]AccountStatusCheckResult{}
	if len(planIDs) > 0 {
		if results, err = s.store.RecentResults(ctx, planIDs, accountStatusCheckHistorySize); err != nil {
			return nil, err
		}
	}
	now := s.now()
	for _, id := range accountIDs {
		row, ok := byAccount[id]
		if !ok {
			continue
		}
		delete(byAccount, id) // repeated IDs are answered once
		var recent []AccountStatusCheckResult
		if row.Config.PlanID != nil {
			recent = results[*row.Config.PlanID]
		}
		items = append(items, accountStatusCheckStatusItem(row, recent, now))
	}
	return items, nil
}

// accountStatusCheckStatusItem aggregates results ordered newest first.
func accountStatusCheckStatusItem(row AccountStatusCheckStatusRow, recent []AccountStatusCheckResult, now time.Time) AccountStatusCheckStatusItem {
	if len(recent) > accountStatusCheckHistorySize {
		recent = recent[:accountStatusCheckHistorySize]
	}
	cfg := row.Config.actual()
	item := AccountStatusCheckStatusItem{
		AccountID:              row.AccountID,
		InheritedFromAccountID: row.InheritedFromAccountID,
		Enabled:                cfg.Enabled,
		State:                  AccountStatusCheckStateUnknown,
		History:                make([]string, 0, len(recent)),
		Completed:              len(recent),
		Model:                  row.EffectiveModel,
		ReasoningEffort:        cfg.ReasoningEffort,
		IntervalMinutes:        cfg.IntervalMinutes,
		CheckEnabled:           cfg.CheckEnabled,
	}
	for i := len(recent) - 1; i >= 0; i-- {
		outcome, matched := accountStatusCheckOutcome(recent[i])
		item.History = append(item.History, outcome)
		if matched {
			item.Matched++
		}
	}
	if item.Completed > 0 {
		rate := math.Round(float64(item.Matched)*1000/float64(item.Completed)) / 10
		item.Rate = &rate
		latest := recent[0]
		outcome, matched := accountStatusCheckOutcome(latest)
		item.State = outcome
		item.Latest = &AccountStatusCheckLatest{
			Status:     outcome,
			Matched:    matched,
			AnswerHint: accountStatusCheckAnswerHint(latest, matched),
			LatencyMs:  latest.LatencyMs,
			StartedAt:  latest.StartedAt,
		}
	}
	if accountStatusCheckDead(row, now) {
		item.State = AccountStatusCheckStateDead
	}
	return item
}

// accountStatusCheckOutcome judges one result with the official candy judge.
func accountStatusCheckOutcome(result AccountStatusCheckResult) (string, bool) {
	if result.Status == "success" && CandyAnswerCorrect(result.ResponseText) {
		return AccountStatusCheckStateNormal, true
	}
	if result.Status == "success" || strings.HasPrefix(result.ErrorMessage, accountStatusCheckAnswerMismatch) {
		return AccountStatusCheckStateDegraded, false
	}
	return AccountStatusCheckStateError, false
}

func accountStatusCheckDead(row AccountStatusCheckStatusRow, now time.Time) bool {
	if row.AccountStatus == StatusError {
		return true
	}
	return row.AutoPauseOnExpired && row.ExpiresAt != nil && !row.ExpiresAt.After(now)
}

func accountStatusCheckAnswerHint(result AccountStatusCheckResult, matched bool) string {
	if matched {
		return "21"
	}
	text := strings.TrimSpace(result.ResponseText)
	if utf8.RuneCountInString(text) > accountStatusCheckAnswerHintRunes {
		text = string([]rune(text)[:accountStatusCheckAnswerHintRunes]) + "…"
	}
	return text
}
