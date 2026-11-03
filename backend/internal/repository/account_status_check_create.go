package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	dbent "github.com/Wei-Shaw/sub2api/ent"
	"github.com/Wei-Shaw/sub2api/internal/service"
)

// 建号事务与配置保存事务复用同一份计划/配置写入，避免两套初始化 SQL。
type statusCheckQueryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func insertStatusCheckPlan(ctx context.Context, q statusCheckQueryer, p *service.ScheduledTestPlan) error {
	rows, err := q.QueryContext(ctx, `INSERT INTO scheduled_test_plans
 (account_id,model_id,cron_expression,enabled,max_results,auto_recover,next_run_at,pelican_config)
 VALUES($1,$2,$3,$4,$5,false,$6,$7) RETURNING id`, p.AccountID, p.ModelID, p.CronExpression, p.Enabled, p.MaxResults, p.NextRunAt, marshalPelicanConfig(p.PelicanConfig))
	if err != nil {
		return err
	}
	defer rows.Close()
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return err
		}
		return fmt.Errorf("status check plan was not created")
	}
	return rows.Scan(&p.ID)
}
func saveStatusCheckConfig(ctx context.Context, q statusCheckQueryer, c *service.AccountStatusCheckConfig) error {
	_, err := q.ExecContext(ctx, `INSERT INTO account_status_check
 (account_id,enabled,check_enabled,interval_minutes,model,reasoning_effort,timeout_seconds,disable_on_degraded,
 reopen_on_recovered,degraded_closed_at,plan_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(account_id) DO UPDATE SET
 enabled=EXCLUDED.enabled,check_enabled=EXCLUDED.check_enabled,interval_minutes=EXCLUDED.interval_minutes,
 model=EXCLUDED.model,reasoning_effort=EXCLUDED.reasoning_effort,timeout_seconds=EXCLUDED.timeout_seconds,
 disable_on_degraded=EXCLUDED.disable_on_degraded,reopen_on_recovered=EXCLUDED.reopen_on_recovered,
 degraded_closed_at=EXCLUDED.degraded_closed_at,plan_id=EXCLUDED.plan_id,updated_at=NOW()`,
		c.AccountID, c.Enabled, c.CheckEnabled, c.IntervalMinutes, c.Model, c.ReasoningEffort, c.TimeoutSeconds, c.DisableOnDegraded,
		c.ReopenOnRecovered, c.DegradedClosedAt, c.PlanID)
	return err
}

// 与账号同一个数据库事务初始化（client 是建号事务的客户端，accountRepository.Create 为此开启事务）；
// 不依赖前端创建后 PUT，失败时账号/计划/配置一起回滚。
func persistStatusCheckCreate(ctx context.Context, client *dbent.Client, a *service.Account, id int64) error {
	if !service.AccountStatusCheckAppliesOnCreate(a) {
		return nil
	}
	copy := *a
	copy.ID = id
	cfg, plan, err := service.InitialAccountStatusCheck(&copy, time.Now())
	if err != nil {
		return err
	}
	if plan != nil {
		if err := insertStatusCheckPlan(ctx, client, plan); err != nil {
			return err
		}
		cfg.PlanID = &plan.ID
	}
	return saveStatusCheckConfig(ctx, client, &cfg)
}

// 修改检测设置也用单事务，不会出现开关已保存但官方计划没更新的半成品状态。
func (r *accountStatusCheckRepository) SavePlan(ctx context.Context, cfg *service.AccountStatusCheckConfig, plan *service.ScheduledTestPlan) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if plan.ID == 0 {
		if err = insertStatusCheckPlan(ctx, tx, plan); err != nil {
			return err
		}
	} else {
		// 只更新读到的那个版本；官方计划页若同时编辑过，保留管理员的新版本并让本次保存重试。
		result, err := tx.ExecContext(ctx, `UPDATE scheduled_test_plans SET model_id=$1,cron_expression=$2,enabled=$3,
 max_results=$4,auto_recover=false,next_run_at=$5,pelican_config=$6,updated_at=clock_timestamp()
 WHERE id=$7 AND account_id=$8 AND updated_at=$9`, plan.ModelID, plan.CronExpression, plan.Enabled, plan.MaxResults,
			plan.NextRunAt, marshalPelicanConfig(plan.PelicanConfig), plan.ID, plan.AccountID, plan.UpdatedAt)
		if err != nil {
			return err
		}
		n, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if n != 1 {
			return fmt.Errorf("status check plan changed; reload settings and retry")
		}
	}
	cfg.PlanID = &plan.ID
	if err = saveStatusCheckConfig(ctx, tx, cfg); err != nil {
		return err
	}
	return tx.Commit()
}
