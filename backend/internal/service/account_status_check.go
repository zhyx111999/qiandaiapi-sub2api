package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"time"

	infraerrors "github.com/Wei-Shaw/sub2api/internal/pkg/errors"
)

// 账号状态检测（降智检测）：管理员给 OpenAI 账号打开后，定时用检测模型答官方内置糖果题、展示答题
// 状态。默认关闭；检测模型默认 gpt-6.1-sol，不替管理员按账号挑模型：填什么就用什么，清空不检测。
// 检测本身只观察，不改账号代理、处罚或计费；调度只由账号自己开启的策略改变（account_status_check_policy.go）。

const (
	accountStatusCheckDefaultInterval = 5
	accountStatusCheckDefaultModel    = "gpt-6.1-sol"
	accountStatusCheckDefaultEffort   = "low"
	accountStatusCheckDefaultTimeout  = 600
	accountStatusCheckIntervalMin     = 1
	accountStatusCheckIntervalMax     = 1440
	accountStatusCheckTimeoutMin      = 5
	accountStatusCheckTimeoutMax      = 600
	accountStatusCheckModelMaxBytes   = 100
	accountStatusCheckPlanMaxResults  = 60
	accountStatusCheckPlanRuleName    = "状态检测·糖果题"
	accountStatusCheckRunTimeout      = 12 * time.Minute
)

var accountStatusCheckEfforts = []string{"none", "low", "medium", "high", "xhigh"}
var (
	ErrAccountStatusCheckOpenAIOnly = infraerrors.BadRequest("ACCOUNT_STATUS_CHECK_OPENAI_ONLY", "status checks require an OpenAI account")
	ErrAccountStatusCheckOff        = infraerrors.Conflict("ACCOUNT_STATUS_CHECK_DISABLED", "automatic status checking is disabled")
	ErrAccountStatusCheckRunning    = infraerrors.Conflict("ACCOUNT_STATUS_CHECK_RUNNING", "a status check is already running")
	ErrAccountStatusCheckInherited  = infraerrors.Conflict("ACCOUNT_STATUS_CHECK_INHERITED", "edit or run the parent account's status check")
)

func accountStatusCheckInvalid(format string, args ...any) error {
	return infraerrors.BadRequest("ACCOUNT_STATUS_CHECK_INVALID", fmt.Sprintf(format, args...))
}

type AccountStatusCheckConfig struct {
	AccountID       int64
	Enabled         bool
	CheckEnabled    bool
	IntervalMinutes int
	Model           string
	ReasoningEffort string
	TimeoutSeconds  int
	// DisableOnDegraded 答错（降智）时关闭账号调度；请求失败不算降智，不触发。
	DisableOnDegraded bool
	// ReopenOnRecovered 降智关闭调度后继续检测，答对（21）就重新打开调度；不开启时降智关闭调度后停止自动检测。
	// 可以单独开启，没有本模块关闭的调度时不起作用。
	ReopenOnRecovered bool
	// DegradedClosedAt 是本模块因降智把调度从开改为关的时间（只由策略写入），恢复只作用于它非空的账号。
	DegradedClosedAt *time.Time
	PlanID           *int64
	// PlanEnabled 是官方计划当前的实际开关，只读（nil 表示还没有计划）；官方“定时测试计划”页面可直接启停它。
	PlanEnabled *bool
}

// actual 以官方计划的实际开关作为“自动检测”的真实状态：账号管理显示、手动检测、补齐与之后的保存
// 都与计划是否真的在跑保持一致，不会把在官方计划页关掉的检测悄悄重新打开。
func (c AccountStatusCheckConfig) actual() AccountStatusCheckConfig {
	if c.Enabled && c.PlanEnabled != nil {
		c.CheckEnabled = *c.PlanEnabled
	}
	return c
}

// 没有记录的账号不检测；管理员打开时自动检测默认随之开启，检测模型默认 gpt-6.1-sol。
func defaultAccountStatusCheckConfig(id int64) AccountStatusCheckConfig {
	return AccountStatusCheckConfig{AccountID: id, Enabled: false, CheckEnabled: true, Model: accountStatusCheckDefaultModel,
		IntervalMinutes: accountStatusCheckDefaultInterval, ReasoningEffort: accountStatusCheckDefaultEffort,
		TimeoutSeconds: accountStatusCheckDefaultTimeout}
}

type AccountStatusCheckInput struct {
	Enabled         *bool   `json:"enabled"`
	CheckEnabled    *bool   `json:"check_enabled"`
	IntervalMinutes *int    `json:"interval_minutes"`
	Model           *string `json:"model"`
	ReasoningEffort *string `json:"reasoning_effort"`
	TimeoutSeconds  *int    `json:"timeout_seconds"`
	// DisableOnDegraded 降智时关闭调度。
	DisableOnDegraded *bool `json:"disable_on_degraded"`
	// ReopenOnRecovered 恢复后打开调度。
	ReopenOnRecovered *bool `json:"reopen_on_recovered"`
}

func (in AccountStatusCheckInput) merge(base AccountStatusCheckConfig) (AccountStatusCheckConfig, error) {
	if in.Enabled == nil {
		return base, accountStatusCheckInvalid("enabled is required")
	}
	base.Enabled = *in.Enabled
	if in.CheckEnabled != nil {
		base.CheckEnabled = *in.CheckEnabled
	}
	if in.IntervalMinutes != nil {
		base.IntervalMinutes = *in.IntervalMinutes
	}
	if in.Model != nil {
		base.Model = strings.TrimSpace(*in.Model)
	}
	if in.ReasoningEffort != nil {
		base.ReasoningEffort = strings.ToLower(strings.TrimSpace(*in.ReasoningEffort))
	}
	if in.TimeoutSeconds != nil {
		base.TimeoutSeconds = *in.TimeoutSeconds
	}
	if in.DisableOnDegraded != nil {
		base.DisableOnDegraded = *in.DisableOnDegraded
	}
	if in.ReopenOnRecovered != nil {
		base.ReopenOnRecovered = *in.ReopenOnRecovered
	}
	if base.IntervalMinutes < accountStatusCheckIntervalMin || base.IntervalMinutes > accountStatusCheckIntervalMax {
		return base, accountStatusCheckInvalid("interval_minutes must be %d-%d", accountStatusCheckIntervalMin, accountStatusCheckIntervalMax)
	}
	if base.TimeoutSeconds < accountStatusCheckTimeoutMin || base.TimeoutSeconds > accountStatusCheckTimeoutMax {
		return base, accountStatusCheckInvalid("timeout_seconds must be %d-%d", accountStatusCheckTimeoutMin, accountStatusCheckTimeoutMax)
	}
	if len(base.Model) > accountStatusCheckModelMaxBytes || !slices.Contains(accountStatusCheckEfforts, base.ReasoningEffort) {
		return base, accountStatusCheckInvalid("invalid model or reasoning_effort")
	}
	_, base.IntervalMinutes = accountStatusCheckSchedule(base.IntervalMinutes)
	return base, nil
}

// 沿用五段 cron 的语义；超过一小时向上取整到整小时，并回显实际间隔。
func accountStatusCheckSchedule(minutes int) (string, int) {
	if minutes < 60 {
		return fmt.Sprintf("*/%d * * * *", minutes), minutes
	}
	if minutes == 60 {
		return "0 * * * *", 60
	}
	hours := (minutes + 59) / 60
	if hours >= 24 {
		return "0 0 * * *", 1440
	}
	return fmt.Sprintf("0 */%d * * *", hours), hours * 60
}

type AccountStatusCheckView struct {
	AccountID              int64  `json:"account_id"`
	Configured             bool   `json:"configured"`
	Enabled                bool   `json:"enabled"`
	CheckEnabled           bool   `json:"check_enabled"`
	IntervalMinutes        int    `json:"interval_minutes"`
	Model                  string `json:"model"`
	ReasoningEffort        string `json:"reasoning_effort"`
	TimeoutSeconds         int    `json:"timeout_seconds"`
	DisableOnDegraded      bool   `json:"disable_on_degraded"`
	ReopenOnRecovered      bool   `json:"reopen_on_recovered"`
	PlanID                 *int64 `json:"plan_id"`
	InheritedFromAccountID *int64 `json:"inherited_from_account_id"`
}

func accountStatusCheckView(a *Account, cfg AccountStatusCheckConfig, configured bool, requested int64) *AccountStatusCheckView {
	cfg = cfg.actual()
	view := &AccountStatusCheckView{AccountID: requested, Configured: configured, Enabled: cfg.Enabled, CheckEnabled: cfg.CheckEnabled,
		IntervalMinutes: cfg.IntervalMinutes, Model: cfg.Model,
		ReasoningEffort: cfg.ReasoningEffort, TimeoutSeconds: cfg.TimeoutSeconds, DisableOnDegraded: cfg.DisableOnDegraded,
		ReopenOnRecovered: cfg.ReopenOnRecovered, PlanID: cfg.PlanID}
	if requested != a.ID {
		id := a.ID
		view.InheritedFromAccountID = &id
	}
	return view
}

type AccountStatusCheckCapabilities struct {
	Defaults AccountStatusCheckDefaults `json:"defaults"`
	Limits   AccountStatusCheckLimits   `json:"limits"`
	Efforts  []string                   `json:"efforts"`
}
type AccountStatusCheckDefaults struct {
	IntervalMinutes   int    `json:"interval_minutes"`
	ReasoningEffort   string `json:"reasoning_effort"`
	TimeoutSeconds    int    `json:"timeout_seconds"`
	DisableOnDegraded bool   `json:"disable_on_degraded"`
	ReopenOnRecovered bool   `json:"reopen_on_recovered"`
}
type AccountStatusCheckLimits struct {
	IntervalMin int `json:"interval_min"`
	IntervalMax int `json:"interval_max"`
	TimeoutMin  int `json:"timeout_min"`
	TimeoutMax  int `json:"timeout_max"`
}

func AccountStatusCheckCapabilitiesView() AccountStatusCheckCapabilities {
	return AccountStatusCheckCapabilities{
		Defaults: AccountStatusCheckDefaults{accountStatusCheckDefaultInterval, accountStatusCheckDefaultEffort, accountStatusCheckDefaultTimeout, false, false},
		Limits:   AccountStatusCheckLimits{1, 1440, 5, 600}, Efforts: slices.Clone(accountStatusCheckEfforts)}
}

type AccountStatusCheckStore interface {
	WithAccountLock(context.Context, int64, func(context.Context) error) error
	Get(context.Context, int64) (*AccountStatusCheckConfig, error)
	Save(context.Context, *AccountStatusCheckConfig) error
	SavePlan(context.Context, *AccountStatusCheckConfig, *ScheduledTestPlan) error
	ListStatus(context.Context, []int64) ([]AccountStatusCheckStatusRow, error)
	RecentResults(context.Context, []int64, int) (map[int64][]AccountStatusCheckResult, error)
	MarkPlanDue(context.Context, int64) (bool, error)
}

type AccountStatusCheckService struct {
	store   AccountStatusCheckStore
	admin   AdminService
	plans   *ScheduledTestService
	runPlan func(*ScheduledTestPlan)
	now     func() time.Time
}

func NewAccountStatusCheckService(store AccountStatusCheckStore, admin AdminService, plans *ScheduledTestService, runner *ScheduledTestRunnerService) *AccountStatusCheckService {
	s := &AccountStatusCheckService{store: store, admin: admin, plans: plans, now: time.Now}
	if runner != nil {
		s.runPlan = func(plan *ScheduledTestPlan) {
			ctx, cancel := context.WithTimeout(context.Background(), accountStatusCheckRunTimeout)
			defer cancel()
			runner.runOnePlan(ctx, plan)
		}
		// The official runner reports each finished plan; only this module's plans are acted on.
		runner.statusCheckFinished = s.followStatusCheck
	}
	return s
}

func (s *AccountStatusCheckService) eligibleAccount(ctx context.Context, id int64) (*Account, error) {
	a, err := s.admin.GetAccount(ctx, id)
	if err != nil {
		return nil, err
	}
	if a == nil {
		return nil, ErrAccountNotFound
	}
	if a.Platform != PlatformOpenAI {
		return nil, ErrAccountStatusCheckOpenAIOnly
	}
	if a.IsShadow() {
		a, err = s.admin.GetAccount(ctx, *a.ParentAccountID)
		if err != nil {
			return nil, err
		}
		if a == nil || a.Platform != PlatformOpenAI || a.IsShadow() {
			return nil, ErrAccountStatusCheckOpenAIOnly
		}
	}
	return a, nil
}

func (s *AccountStatusCheckService) Get(ctx context.Context, id int64) (*AccountStatusCheckView, error) {
	a, err := s.eligibleAccount(ctx, id)
	if err != nil {
		return nil, err
	}
	cfg, err := s.config(ctx, a.ID)
	if err != nil {
		return nil, err
	}
	if cfg == nil {
		return accountStatusCheckView(a, defaultAccountStatusCheckConfig(a.ID), false, id), nil
	}
	return accountStatusCheckView(a, *cfg, true, id), nil
}

// config 读取已保存配置并换算成实际状态；所有读取入口都经过这里，保证口径一致。
func (s *AccountStatusCheckService) config(ctx context.Context, id int64) (*AccountStatusCheckConfig, error) {
	cfg, err := s.store.Get(ctx, id)
	if err != nil || cfg == nil {
		return cfg, err
	}
	actual := cfg.actual()
	return &actual, nil
}

func (s *AccountStatusCheckService) Update(ctx context.Context, id int64, in AccountStatusCheckInput) (*AccountStatusCheckView, error) {
	var view *AccountStatusCheckView
	err := s.store.WithAccountLock(ctx, id, func(ctx context.Context) error {
		a, err := s.eligibleAccount(ctx, id)
		if err != nil {
			return err
		}
		if a.ID != id {
			return ErrAccountStatusCheckInherited
		}
		cur, err := s.config(ctx, id)
		if err != nil {
			return err
		}
		cfg := defaultAccountStatusCheckConfig(id)
		if cur != nil {
			cfg = *cur
		}
		next, err := in.merge(cfg)
		if err != nil {
			return err
		}
		view, err = s.apply(ctx, a, next)
		return err
	})
	return view, err
}

// 配置与官方计划一起提交；旧计划直接沿用 ID，历史结果不变。
func (s *AccountStatusCheckService) apply(ctx context.Context, a *Account, cfg AccountStatusCheckConfig) (*AccountStatusCheckView, error) {
	plan, err := s.ownedPlan(ctx, cfg)
	if err != nil {
		return nil, err
	}
	created := plan == nil
	if created {
		plan = &ScheduledTestPlan{AccountID: a.ID}
	}
	previous := *plan
	accountStatusCheckPlan(plan, cfg)
	// 返回的视图按本次写入后计划的实际开关显示（例如没有文本模型时仍是关闭）。
	enabled := plan.Enabled
	cfg.PlanEnabled = &enabled
	switch {
	case created && !enabled:
		// 无需执行时不建空计划。
		cfg.PlanID, cfg.PlanEnabled = nil, nil
		return s.saveView(ctx, a, cfg)
	case !created:
		cfg.PlanID = &plan.ID
		if reflect.DeepEqual(previous, *plan) {
			return s.saveView(ctx, a, cfg)
		}
	}
	// 复用官方计划校验与下次执行时间计算；实际配置/计划写入由存储事务一次提交。
	next, err := nextPlanRun(plan, s.now())
	if err != nil {
		return nil, err
	}
	plan.NextRunAt = &next
	if err := s.store.SavePlan(ctx, &cfg, plan); err != nil {
		return nil, err
	}
	return accountStatusCheckView(a, cfg, true, a.ID), nil
}

// 计划无需改动时只保存配置；配置里的自动检测开关由此与计划实际状态对齐。
func (s *AccountStatusCheckService) saveView(ctx context.Context, a *Account, cfg AccountStatusCheckConfig) (*AccountStatusCheckView, error) {
	if err := s.store.Save(ctx, &cfg); err != nil {
		return nil, err
	}
	return accountStatusCheckView(a, cfg, true, a.ID), nil
}

func (s *AccountStatusCheckService) ownedPlan(ctx context.Context, cfg AccountStatusCheckConfig) (*ScheduledTestPlan, error) {
	if cfg.PlanID != nil {
		p, err := s.plans.GetPlan(ctx, *cfg.PlanID)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
		if p != nil && p.AccountID == cfg.AccountID && isAccountStatusCheckPlan(p) {
			return p, nil
		}
	}
	plans, err := s.plans.ListPlansByAccount(ctx, cfg.AccountID)
	if err != nil {
		return nil, err
	}
	for _, p := range plans {
		if isAccountStatusCheckPlan(p) {
			return p, nil
		}
	}
	return nil, nil
}

func isAccountStatusCheckPlan(p *ScheduledTestPlan) bool {
	return p != nil && p.PelicanConfig != nil && p.PelicanConfig.Quality == nil && isBuiltinCandyPlan(p.PelicanConfig) &&
		p.PelicanConfig.RuleName == accountStatusCheckPlanRuleName
}

// 检测模型就是管理员填写的模型；没填时计划停用，保留原模型字段以满足官方计划的保存格式。
func accountStatusCheckPlan(p *ScheduledTestPlan, cfg AccountStatusCheckConfig) *ScheduledTestPlan {
	model := cfg.Model
	if model != "" || p.ID == 0 {
		p.ModelID = model
	}
	p.CronExpression, _ = accountStatusCheckSchedule(cfg.IntervalMinutes)
	p.Enabled = cfg.Enabled && cfg.CheckEnabled && model != ""
	p.AutoRecover = false
	p.MaxResults = max(p.MaxResults, accountStatusCheckPlanMaxResults)
	p.PelicanConfig = &PelicanTestConfig{RuleName: accountStatusCheckPlanRuleName, QuestionKind: "candy", Prompt: CandyPrompt,
		ReasoningEffort: cfg.ReasoningEffort, ParallelCount: 1, ModelID: p.ModelID, StatusCheckTimeoutSeconds: cfg.TimeoutSeconds}
	return p
}

func (s *AccountStatusCheckService) Run(ctx context.Context, id int64) error {
	a, err := s.eligibleAccount(ctx, id)
	if err != nil {
		return err
	}
	if a.ID != id {
		return ErrAccountStatusCheckInherited
	}
	cfg, err := s.config(ctx, id)
	if err != nil {
		return err
	}
	if cfg == nil || !cfg.Enabled || !cfg.CheckEnabled || cfg.PlanID == nil {
		return ErrAccountStatusCheckOff
	}
	queued, err := s.store.MarkPlanDue(ctx, *cfg.PlanID)
	if err != nil {
		return err
	}
	if !queued {
		plan, err := s.plans.GetPlan(ctx, *cfg.PlanID)
		if err != nil || plan == nil || !plan.Enabled {
			return ErrAccountStatusCheckOff
		}
		return ErrAccountStatusCheckRunning
	}
	if s.runPlan != nil {
		if plan, err := s.plans.GetPlan(ctx, *cfg.PlanID); err == nil && plan != nil {
			go s.runPlan(plan)
		}
	}
	return nil
}

// 状态检测的测试请求只观察，复用官方 observeOnly 上下文：请求失败不会连带把账号标错。
// 调度只由 followStatusCheck 按账号自己开启的策略改变。
func accountStatusCheckObservation(cfg *PelicanTestConfig) bool {
	return isAccountStatusCheckPlan(&ScheduledTestPlan{PelicanConfig: cfg})
}

func accountStatusCheckPlanTimeout(plan *ScheduledTestPlan, original time.Duration) time.Duration {
	if !isAccountStatusCheckPlan(plan) {
		return original
	}
	seconds := plan.PelicanConfig.StatusCheckTimeoutSeconds
	if seconds < accountStatusCheckTimeoutMin || seconds > accountStatusCheckTimeoutMax {
		seconds = accountStatusCheckDefaultTimeout
	}
	return time.Duration(seconds) * time.Second
}
