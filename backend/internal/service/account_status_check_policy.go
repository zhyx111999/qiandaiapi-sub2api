package service

import (
	"context"

	"github.com/Wei-Shaw/sub2api/internal/pkg/logger"
)

// closeIfDegraded turns scheduling off for the account of a finished status check plan whose answer was
// wrong (degraded), when the account's status check asks for it (DisableOnDegraded). A failed request is
// not a degraded answer and changes nothing; neither does a correct one. Scheduling stays off until an
// administrator turns it back on. The plan's single sample is judged like the status display judges it.
func (s *AccountStatusCheckService) closeIfDegraded(ctx context.Context, plan *ScheduledTestPlan, results []*ScheduledTestResult) {
	if !isAccountStatusCheckPlan(plan) || len(results) == 0 || results[0] == nil {
		return
	}
	result := results[0]
	outcome, _ := accountStatusCheckOutcome(AccountStatusCheckResult{Status: result.Status, ResponseText: result.ResponseText, ErrorMessage: result.ErrorMessage})
	if outcome != AccountStatusCheckStateDegraded {
		return
	}
	cfg, err := s.config(ctx, plan.AccountID)
	if err != nil || cfg == nil || !cfg.Enabled || !cfg.DisableOnDegraded {
		return
	}
	if _, err := s.admin.SetAccountSchedulable(ctx, plan.AccountID, false); err != nil {
		logger.LegacyPrintf("service.account_status_check", "[AccountStatusCheck] account %d answered wrong; turning scheduling off failed: %v", plan.AccountID, err)
		return
	}
	logger.LegacyPrintf("service.account_status_check", "[AccountStatusCheck] account %d answered the status check wrong (%q); scheduling turned off",
		plan.AccountID, accountStatusCheckAnswerHint(AccountStatusCheckResult{ResponseText: result.ResponseText}, false))
}
