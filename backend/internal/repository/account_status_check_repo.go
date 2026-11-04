package repository

import (
	"context"
	"database/sql"
	"errors"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/lib/pq"
)

// 独立存储状态检测配置；计划和结果仍是官方 scheduled_test_*，不写账号代理或调度字段。
type accountStatusCheckRepository struct{ db *sql.DB }

func NewAccountStatusCheckRepository(db *sql.DB) service.AccountStatusCheckStore {
	return &accountStatusCheckRepository{db: db}
}

const statusCheckEligible = `a.deleted_at IS NULL AND a.platform='openai'`

func scanAccountStatusCheckConfig(row interface{ Scan(...any) error }, extra ...any) (*service.AccountStatusCheckConfig, error) {
	c := &service.AccountStatusCheckConfig{}
	dest := append([]any{&c.AccountID, &c.Enabled, &c.CheckEnabled, &c.IntervalMinutes, &c.Model, &c.ReasoningEffort, &c.TimeoutSeconds, &c.DisableOnDegraded, &c.ReopenOnRecovered, &c.DegradedClosedAt,
		&c.PlanID, &c.PlanEnabled}, extra...)
	err := row.Scan(dest...)
	return c, err
}
func (r *accountStatusCheckRepository) Get(ctx context.Context, id int64) (*service.AccountStatusCheckConfig, error) {
	// 以普通（非影子）OpenAI 账号为读取边界；同时读出计划的实际开关（只读），由服务层换算成真实的自动检测状态。
	var configured bool
	c, err := scanAccountStatusCheckConfig(r.db.QueryRowContext(ctx, `SELECT a.id,COALESCE(p.enabled,false),
 COALESCE(p.check_enabled,true),COALESCE(p.interval_minutes,5),COALESCE(p.model,''),
 COALESCE(p.reasoning_effort,'low'),COALESCE(p.timeout_seconds,600),COALESCE(p.disable_on_degraded,false),
 COALESCE(p.reopen_on_recovered,false),p.degraded_closed_at,p.plan_id,sp.enabled,
 p.account_id IS NOT NULL
 FROM accounts a LEFT JOIN account_status_check p ON p.account_id=a.id
 LEFT JOIN scheduled_test_plans sp ON sp.id=p.plan_id AND sp.account_id=a.id
 WHERE a.id=$1 AND a.parent_account_id IS NULL AND `+statusCheckEligible, id), &configured)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, service.ErrAccountNotFound
	}
	if err != nil {
		return nil, err
	}
	if !configured {
		return nil, nil
	}
	return c, nil
}
func (r *accountStatusCheckRepository) Save(ctx context.Context, c *service.AccountStatusCheckConfig) error {
	return saveStatusCheckConfig(ctx, r.db, c)
}
func (r *accountStatusCheckRepository) ListStatus(ctx context.Context, ids []int64) ([]service.AccountStatusCheckStatusRow, error) {
	// 左连接保证尚未补齐的 OpenAI 账号也有灰色状态；影子使用母账号的配置/计划，保留自身账号状态。
	rows, err := r.db.QueryContext(ctx, `SELECT COALESCE(p.account_id,COALESCE(a.parent_account_id,a.id)),
 COALESCE(p.enabled,false),COALESCE(p.check_enabled,true),COALESCE(p.interval_minutes,5),COALESCE(p.model,''),
 COALESCE(p.reasoning_effort,'low'),COALESCE(p.timeout_seconds,600),COALESCE(p.disable_on_degraded,false),
 COALESCE(p.reopen_on_recovered,false),p.degraded_closed_at,p.plan_id,sp.enabled,
 a.id,a.parent_account_id,COALESCE(sp.model_id,''),a.platform,a.status,a.expires_at,a.auto_pause_on_expired
 FROM accounts a LEFT JOIN account_status_check p ON p.account_id=COALESCE(a.parent_account_id,a.id)
 LEFT JOIN scheduled_test_plans sp ON sp.id=p.plan_id AND sp.account_id=p.account_id
 WHERE a.id=ANY($1) AND `+statusCheckEligible, pq.Array(ids))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []service.AccountStatusCheckStatusRow{}
	for rows.Next() {
		var row service.AccountStatusCheckStatusRow
		c, err := scanAccountStatusCheckConfig(rows, &row.AccountID, &row.InheritedFromAccountID, &row.EffectiveModel, &row.Platform, &row.AccountStatus, &row.ExpiresAt, &row.AutoPauseOnExpired)
		if err != nil {
			return nil, err
		}
		row.Config = *c
		out = append(out, row)
	}
	return out, rows.Err()
}
func (r *accountStatusCheckRepository) RecentResults(ctx context.Context, ids []int64, limit int) (map[int64][]service.AccountStatusCheckResult, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,plan_id,status,CASE WHEN length(response_text)<=4096 THEN response_text ELSE '' END,
 left(error_message,512),latency_ms,started_at FROM (
 SELECT r.*,row_number() OVER(PARTITION BY r.plan_id ORDER BY r.started_at DESC,r.id DESC) AS rn
 FROM scheduled_test_results r WHERE r.plan_id=ANY($1)) ranked
 WHERE rn<=$2 ORDER BY plan_id,started_at DESC,id DESC`, pq.Array(ids), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64][]service.AccountStatusCheckResult{}
	for rows.Next() {
		var row service.AccountStatusCheckResult
		if err = rows.Scan(&row.ID, &row.PlanID, &row.Status, &row.ResponseText, &row.ErrorMessage, &row.LatencyMs, &row.StartedAt); err != nil {
			return nil, err
		}
		out[row.PlanID] = append(out[row.PlanID], row)
	}
	return out, rows.Err()
}
func (r *accountStatusCheckRepository) MarkPlanDue(ctx context.Context, id int64) (bool, error) {
	res, err := r.db.ExecContext(ctx, `UPDATE scheduled_test_plans SET next_run_at=NOW(),updated_at=NOW()
 WHERE id=$1 AND enabled AND (running_until IS NULL OR running_until<NOW())`, id)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}
