package service

import (
	"context"

	"github.com/Wei-Shaw/sub2api/internal/pkg/logger"
)

// followStatusCheck acts on the account of a finished status check plan (this module's plans only),
// judging the plan's single sample like the status display does:
//
//   - a wrong answer (degraded) with DisableOnDegraded turns scheduling off. Only a change from on to
//     off made here is remembered (DegradedClosedAt), so an account an administrator closed is never
//     reopened by the check. Without ReopenOnRecovered the automatic check stops with it;
//   - a correct answer (21) with ReopenOnRecovered turns scheduling back on for an account this module
//     closed. ReopenOnRecovered may be on without DisableOnDegraded; it then has nothing to reopen.
//
// A failed request is neither and changes nothing. The stopped check and the marker are written through
// the same path as an edit.
func (s *AccountStatusCheckService) followStatusCheck(ctx context.Context, plan *ScheduledTestPlan, results []*ScheduledTestResult) {
	if !isAccountStatusCheckPlan(plan) || len(results) == 0 || results[0] == nil {
		return
	}
	result := AccountStatusCheckResult{Status: results[0].Status, ResponseText: results[0].ResponseText, ErrorMessage: results[0].ErrorMessage}
	outcome, _ := accountStatusCheckOutcome(result)
	if outcome != AccountStatusCheckStateDegraded && outcome != AccountStatusCheckStateNormal {
		return
	}
	if err := s.followOutcome(ctx, plan.AccountID, outcome, result); err != nil {
		logger.LegacyPrintf("service.account_status_check", "[AccountStatusCheck] account %d: acting on the %s answer failed: %v", plan.AccountID, outcome, err)
	}
}

func (s *AccountStatusCheckService) followOutcome(ctx context.Context, id int64, outcome string, result AccountStatusCheckResult) error {
	a, err := s.eligibleAccount(ctx, id)
	if err != nil || a.ID != id {
		return err
	}
	cfg, err := s.config(ctx, a.ID)
	if err != nil || cfg == nil || !cfg.Enabled {
		return err
	}
	if outcome == AccountStatusCheckStateDegraded {
		return s.closeDegraded(ctx, a, *cfg, accountStatusCheckAnswerHint(result, false))
	}
	return s.reopenRecovered(ctx, a, *cfg)
}

func (s *AccountStatusCheckService) closeDegraded(ctx context.Context, a *Account, cfg AccountStatusCheckConfig, answer string) error {
	if !cfg.DisableOnDegraded {
		return nil
	}
	changed := false
	if a.Schedulable {
		if _, err := s.admin.SetAccountSchedulable(ctx, a.ID, false); err != nil {
			return err
		}
		if cfg.DegradedClosedAt == nil {
			now := s.now()
			cfg.DegradedClosedAt = &now
		}
		changed = true
		logger.LegacyPrintf("service.account_status_check", "[AccountStatusCheck] account %d answered the status check wrong (%q); scheduling turned off", a.ID, answer)
	}
	if !cfg.ReopenOnRecovered && cfg.CheckEnabled {
		cfg.CheckEnabled = false
		changed = true
		logger.LegacyPrintf("service.account_status_check", "[AccountStatusCheck] account %d is degraded; automatic checking stopped", a.ID)
	}
	if !changed {
		return nil
	}
	_, err := s.apply(ctx, a, cfg)
	return err
}

func (s *AccountStatusCheckService) reopenRecovered(ctx context.Context, a *Account, cfg AccountStatusCheckConfig) error {
	if !cfg.ReopenOnRecovered || cfg.DegradedClosedAt == nil {
		return nil
	}
	if !a.Schedulable {
		if _, err := s.admin.SetAccountSchedulable(ctx, a.ID, true); err != nil {
			return err
		}
		logger.LegacyPrintf("service.account_status_check", "[AccountStatusCheck] account %d answered 21 again; scheduling turned back on", a.ID)
	}
	cfg.DegradedClosedAt = nil
	_, err := s.apply(ctx, a, cfg)
	return err
}
