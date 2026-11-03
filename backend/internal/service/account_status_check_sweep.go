package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/pkg/logger"
)

const (
	accountStatusCheckSweepInterval = time.Minute
	accountStatusCheckSweepTimeout  = 50 * time.Second
	accountStatusCheckSweepBatch    = 1000
)

// 沿用已有后台服务生命周期：只在 full owner 激活后启动，不让预热实例发出定时请求。
func (s *AccountStatusCheckService) Start() {
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil || s.stopped {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	s.cancel, s.done = cancel, make(chan struct{})
	go s.loop(ctx, s.done)
}
func (s *AccountStatusCheckService) Stop() {
	if s == nil {
		return
	}
	s.mu.Lock()
	cancel, done := s.cancel, s.done
	s.stopped = true
	s.mu.Unlock()
	if cancel != nil {
		cancel()
		<-done
	}
}
func (s *AccountStatusCheckService) loop(ctx context.Context, done chan struct{}) {
	defer close(done)
	ticker := time.NewTicker(accountStatusCheckSweepInterval)
	defer ticker.Stop()
	for {
		s.sweep(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// 首轮与每分钟只补缺失的配置/计划，不重新开启手动关闭的记录。
func (s *AccountStatusCheckService) sweep(ctx context.Context) {
	ctx, cancel := context.WithTimeout(ctx, accountStatusCheckSweepTimeout)
	defer cancel()
	var issues []string
	ids, err := s.store.ListReconcileAccountIDs(ctx, accountStatusCheckSweepBatch)
	if err != nil {
		issues = append(issues, "list: "+err.Error())
	}
	for _, id := range ids {
		if ctx.Err() != nil {
			break
		}
		if err := s.reconcile(ctx, id); err != nil {
			issues = append(issues, fmt.Sprintf("account %d: %v", id, err))
		}
	}
	summary := ""
	if len(issues) > 0 {
		summary = fmt.Sprintf("%d failed: %s", len(issues), strings.Join(issues[:min(len(issues), 5)], "; "))
	}
	s.mu.Lock()
	changed := s.lastIssue != summary
	s.lastIssue = summary
	s.mu.Unlock()
	if changed {
		logger.LegacyPrintf("service.account_status_check", "[AccountStatusCheck] %s", summary)
	}
}
func (s *AccountStatusCheckService) reconcile(ctx context.Context, id int64) error {
	return s.store.WithAccountLock(ctx, id, func(ctx context.Context) error {
		a, err := s.eligibleAccount(ctx, id)
		if errors.Is(err, ErrAccountNotFound) || errors.Is(err, ErrAccountStatusCheckOpenAIOnly) {
			return nil
		}
		if err != nil {
			return err
		}
		if a.ID != id {
			return nil
		}
		cur, err := s.config(ctx, id)
		if err != nil {
			return err
		}
		cfg := defaultAccountStatusCheckConfig(id)
		if cur != nil {
			cfg = *cur
		}
		_, err = s.apply(ctx, a, cfg)
		return err
	})
}
