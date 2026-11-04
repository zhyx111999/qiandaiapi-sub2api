//go:build unit

package service

import (
	"context"
	"database/sql"
	"slices"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type statusCheckPlans struct {
	ScheduledTestPlanRepository
	plans            map[int64]*ScheduledTestPlan
	next             int64
	creates, updates int
}

func copyStatusPlan(p *ScheduledTestPlan) *ScheduledTestPlan {
	c := *p
	if p.PelicanConfig != nil {
		x := *p.PelicanConfig
		c.PelicanConfig = &x
	}
	return &c
}
func (r *statusCheckPlans) Create(_ context.Context, p *ScheduledTestPlan) (*ScheduledTestPlan, error) {
	r.next++
	c := copyStatusPlan(p)
	c.ID = r.next
	r.plans[c.ID] = c
	r.creates++
	return copyStatusPlan(c), nil
}
func (r *statusCheckPlans) GetByID(_ context.Context, id int64) (*ScheduledTestPlan, error) {
	if p := r.plans[id]; p != nil {
		return copyStatusPlan(p), nil
	}
	return nil, sql.ErrNoRows
}
func (r *statusCheckPlans) ListByAccountID(_ context.Context, id int64) ([]*ScheduledTestPlan, error) {
	var out []*ScheduledTestPlan
	for _, p := range r.plans {
		if p.AccountID == id {
			out = append(out, copyStatusPlan(p))
		}
	}
	return out, nil
}
func (r *statusCheckPlans) Update(_ context.Context, p *ScheduledTestPlan) (*ScheduledTestPlan, error) {
	r.plans[p.ID] = copyStatusPlan(p)
	r.updates++
	return copyStatusPlan(p), nil
}

type statusCheckAdmin struct {
	AdminService
	accounts map[int64]*Account
	deleted  map[int64]bool
	// updates lists the accounts whose scheduling was changed.
	updates []int64
}

func (a *statusCheckAdmin) GetAccount(_ context.Context, id int64) (*Account, error) {
	if acc := a.accounts[id]; acc != nil && !a.deleted[id] {
		return acc, nil
	}
	return nil, ErrAccountNotFound
}
func (a *statusCheckAdmin) SetAccountSchedulable(_ context.Context, id int64, schedulable bool) (*Account, error) {
	a.updates = append(a.updates, id)
	a.accounts[id].Schedulable = schedulable
	return a.accounts[id], nil
}

func statusCheckID(v int64) *int64 { return &v }
func statusCheckBool(v bool) *bool { return &v }

type statusCheckStore struct {
	AccountStatusCheckStore
	rows    map[int64]AccountStatusCheckConfig
	admin   *statusCheckAdmin
	plans   *statusCheckPlans
	results map[int64][]AccountStatusCheckResult
	busy    bool
	saves   int
}

// withPlan 与真实 SQL 一致：只读地附上本账号计划的实际开关。
func (r *statusCheckStore) withPlan(c AccountStatusCheckConfig) AccountStatusCheckConfig {
	c.PlanEnabled = nil
	if c.PlanID != nil {
		if p := r.plans.plans[*c.PlanID]; p != nil && p.AccountID == c.AccountID {
			enabled := p.Enabled
			c.PlanEnabled = &enabled
		}
	}
	return c
}
func (r *statusCheckStore) Get(_ context.Context, id int64) (*AccountStatusCheckConfig, error) {
	c, ok := r.rows[id]
	if !ok {
		return nil, nil
	}
	c = r.withPlan(c)
	return &c, nil
}
func (r *statusCheckStore) Save(_ context.Context, c *AccountStatusCheckConfig) error {
	stored := *c
	stored.PlanEnabled = nil // 只读字段不入库
	r.rows[c.AccountID] = stored
	r.saves++
	return nil
}
func (r *statusCheckStore) SavePlan(ctx context.Context, cfg *AccountStatusCheckConfig, plan *ScheduledTestPlan) error {
	var saved *ScheduledTestPlan
	var err error
	if plan.ID == 0 {
		saved, err = r.plans.Create(ctx, plan)
	} else {
		saved, err = r.plans.Update(ctx, plan)
	}
	if err != nil {
		return err
	}
	*plan = *saved
	cfg.PlanID = &plan.ID
	return r.Save(ctx, cfg)
}

func (r *statusCheckStore) ListStatus(_ context.Context, ids []int64) ([]AccountStatusCheckStatusRow, error) {
	var out []AccountStatusCheckStatusRow
	for _, id := range ids {
		a := r.admin.accounts[id]
		if a == nil || a.Platform != PlatformOpenAI {
			continue
		}
		target := a.ID
		if a.IsShadow() {
			target = *a.ParentAccountID
		}
		cfg, ok := r.rows[target]
		if !ok {
			cfg = defaultAccountStatusCheckConfig(target)
		}
		cfg = r.withPlan(cfg)
		model := ""
		if cfg.PlanID != nil && r.plans.plans[*cfg.PlanID] != nil {
			model = r.plans.plans[*cfg.PlanID].ModelID
		}
		out = append(out, AccountStatusCheckStatusRow{AccountID: id, InheritedFromAccountID: a.ParentAccountID, EffectiveModel: model, Config: cfg,
			Platform: a.Platform, AccountStatus: a.Status, ExpiresAt: a.ExpiresAt, AutoPauseOnExpired: a.AutoPauseOnExpired})
	}
	return out, nil
}
func (r *statusCheckStore) RecentResults(_ context.Context, ids []int64, _ int) (map[int64][]AccountStatusCheckResult, error) {
	out := map[int64][]AccountStatusCheckResult{}
	for _, id := range ids {
		out[id] = slices.Clone(r.results[id])
	}
	return out, nil
}
func (r *statusCheckStore) MarkPlanDue(_ context.Context, id int64) (bool, error) {
	return !r.busy && r.plans.plans[id] != nil && r.plans.plans[id].Enabled, nil
}
func statusCheckHarness(t *testing.T) (*AccountStatusCheckService, *statusCheckStore) {
	t.Helper()
	a := &statusCheckAdmin{accounts: map[int64]*Account{}, deleted: map[int64]bool{}}
	p := &statusCheckPlans{plans: map[int64]*ScheduledTestPlan{}, next: 100}
	r := &statusCheckStore{rows: map[int64]AccountStatusCheckConfig{}, admin: a, plans: p, results: map[int64][]AccountStatusCheckResult{}}
	s := NewAccountStatusCheckService(r, a, NewScheduledTestService(p, nil), nil)
	return s, r
}

// statusCheckOn turns the status check of an account on with the given check model.
func statusCheckOn(t *testing.T, s *AccountStatusCheckService, id int64, model string) *AccountStatusCheckView {
	t.Helper()
	view, err := s.Update(context.Background(), id, AccountStatusCheckInput{Enabled: statusCheckBool(true), Model: &model})
	require.NoError(t, err)
	return view
}

// 默认关闭：没有记录的账号不检测；打开后只用填写的模型（填什么用什么），不填不建计划。
func TestAccountStatusCheckOffUntilTurnedOn(t *testing.T) {
	s, r := statusCheckHarness(t)
	ctx := context.Background()
	for i, kind := range []string{AccountTypeOAuth, AccountTypeAPIKey, AccountTypeSetupToken, "other"} {
		id := int64(i + 1)
		r.admin.accounts[id] = &Account{ID: id, Platform: PlatformOpenAI, Type: kind, Status: StatusActive, ProxyID: statusCheckID(8),
			Credentials: map[string]any{"model_mapping": map[string]any{"gpt-image-2": "gpt-image-2"}}}
	}
	r.admin.accounts[8] = &Account{ID: 8, Platform: PlatformGemini, Type: AccountTypeAPIKey}
	r.admin.accounts[9] = &Account{ID: 9, Platform: PlatformOpenAI, Type: AccountTypeOAuth, ParentAccountID: statusCheckID(1)}

	for id := int64(1); id <= 4; id++ {
		view, err := s.Get(ctx, id)
		require.NoError(t, err)
		require.False(t, view.Configured || view.Enabled, "off until an administrator turns it on")
		require.Equal(t, "gpt-6.1-sol", view.Model, "the default check model")
		require.Nil(t, view.PlanID)
	}
	items, err := s.Status(ctx, []int64{1, 2})
	require.NoError(t, err)
	require.Len(t, items, 2)
	require.False(t, items[0].Enabled || items[1].Enabled)
	require.Zero(t, r.saves)
	require.Zero(t, r.plans.creates)
	_, err = s.Get(ctx, 8)
	require.ErrorIs(t, err, ErrAccountStatusCheckOpenAIOnly)

	// Turned on as it stands: the default check model.
	view, err := s.Update(ctx, 2, AccountStatusCheckInput{Enabled: statusCheckBool(true)})
	require.NoError(t, err)
	require.Equal(t, "gpt-6.1-sol", view.Model)
	require.Equal(t, "gpt-6.1-sol", r.plans.plans[*view.PlanID].ModelID)

	// On with the model cleared: saved, nothing to run.
	view = statusCheckOn(t, s, 1, "")
	require.True(t, view.Configured && view.Enabled && view.CheckEnabled)
	require.Nil(t, view.PlanID)
	require.Equal(t, 1, r.plans.creates)
	require.ErrorIs(t, s.Run(ctx, 1), ErrAccountStatusCheckOff)

	// Any model the administrator fills in is used as is, an image model too.
	view = statusCheckOn(t, s, 1, "gpt-image-2")
	require.Equal(t, "gpt-image-2", view.Model)
	require.NotNil(t, view.PlanID)
	p := r.plans.plans[*view.PlanID]
	require.Equal(t, "gpt-image-2", p.ModelID)
	require.True(t, p.Enabled)
	require.Equal(t, "*/5 * * * *", p.CronExpression)
	require.False(t, p.AutoRecover)
	require.Nil(t, p.PelicanConfig.Quality)
	require.True(t, accountStatusCheckObservation(p.PelicanConfig), "the check itself only observes")
	require.Equal(t, CandyPrompt, p.PelicanConfig.Prompt)
	require.Empty(t, r.admin.updates)

	// 影子沿用母账号计划，不能用子账号编辑或重复发检查。
	view, err = s.Get(ctx, 9)
	require.NoError(t, err)
	require.Equal(t, int64(1), *view.InheritedFromAccountID)
	_, err = s.Update(ctx, 9, AccountStatusCheckInput{Enabled: statusCheckBool(true)})
	require.ErrorIs(t, err, ErrAccountStatusCheckInherited)
	require.ErrorIs(t, s.Run(ctx, 9), ErrAccountStatusCheckInherited)
}

func TestAccountStatusCheckReadOnlyStatusAndHistory(t *testing.T) {
	s, r := statusCheckHarness(t)
	r.admin.accounts[1] = &Account{ID: 1, Platform: PlatformOpenAI, Type: AccountTypeAPIKey, Status: StatusActive}
	ctx := context.Background()
	view := statusCheckOn(t, s, 1, "gpt-6-astra")
	items, err := s.Status(ctx, []int64{1, 1})
	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Equal(t, AccountStatusCheckStateUnknown, items[0].State)
	require.True(t, items[0].Enabled)
	require.Equal(t, "gpt-6-astra", items[0].Model)
	id := *view.PlanID
	r.results[id] = []AccountStatusCheckResult{{Status: "failed", ResponseText: "20", ErrorMessage: "answer_mismatch: expected 21"}, {Status: "success", ResponseText: "21"}, {Status: "failed", ErrorMessage: "timeout"}}
	items, err = s.Status(ctx, []int64{1})
	require.NoError(t, err)
	require.Equal(t, AccountStatusCheckStateDegraded, items[0].State)
	require.Equal(t, []string{"error", "normal", "degraded"}, items[0].History)
	require.Equal(t, 33.3, *items[0].Rate)
	require.Equal(t, "20", items[0].Latest.AnswerHint)
	r.admin.accounts[1].Status = StatusError
	items, err = s.Status(ctx, []int64{1})
	require.NoError(t, err)
	require.Equal(t, AccountStatusCheckStateDead, items[0].State)
}

// 关闭自动检测后重新打开沿用原计划。
func TestAccountStatusCheckManualOff(t *testing.T) {
	s, r := statusCheckHarness(t)
	ctx := context.Background()
	r.admin.accounts[1] = &Account{ID: 1, Platform: PlatformOpenAI, Type: AccountTypeOAuth}
	id := *statusCheckOn(t, s, 1, "gpt-6-astra").PlanID
	_, err := s.Update(ctx, 1, AccountStatusCheckInput{Enabled: statusCheckBool(true), CheckEnabled: statusCheckBool(false)})
	require.NoError(t, err)
	require.False(t, r.plans.plans[id].Enabled)
	require.False(t, r.rows[1].CheckEnabled)
	view, err := s.Update(ctx, 1, AccountStatusCheckInput{Enabled: statusCheckBool(true), CheckEnabled: statusCheckBool(true)})
	require.NoError(t, err)
	require.Equal(t, id, *view.PlanID)
	require.True(t, r.plans.plans[id].Enabled)
	require.Equal(t, 1, r.plans.creates)
	require.Empty(t, r.admin.updates)
}

func TestAccountStatusCheckTimeout(t *testing.T) {
	cfg := defaultAccountStatusCheckConfig(1)
	require.False(t, cfg.Enabled, "off by default")
	require.Equal(t, "gpt-6.1-sol", cfg.Model)
	require.False(t, cfg.DisableOnDegraded || cfg.ReopenOnRecovered, "the policies are opt-in")
	cfg.Enabled, cfg.Model = true, "gpt-6-astra"
	p := accountStatusCheckPlan(&ScheduledTestPlan{AccountID: 1}, cfg)
	require.True(t, p.Enabled)
	p.PelicanConfig.StatusCheckTimeoutSeconds = 27
	require.Equal(t, 27*time.Second, accountStatusCheckPlanTimeout(p, 10*time.Minute))
	other := *p
	other.PelicanConfig = &PelicanTestConfig{RuleName: "admin quality rule", Prompt: CandyPrompt}
	require.Equal(t, 10*time.Minute, accountStatusCheckPlanTimeout(&other, 10*time.Minute), "other plans keep the runner's limit")
	require.False(t, accountStatusCheckObservation(other.PelicanConfig))
}

func TestAccountStatusCheckModelAndRun(t *testing.T) {
	s, r := statusCheckHarness(t)
	ctx := context.Background()
	r.admin.accounts[1] = &Account{ID: 1, Platform: PlatformOpenAI, Type: AccountTypeAPIKey}
	view := statusCheckOn(t, s, 1, "deepseek-v4-flash")
	id := *view.PlanID
	require.Equal(t, "deepseek-v4-flash", r.plans.plans[id].ModelID)
	called := make(chan int64, 1)
	s.runPlan = func(p *ScheduledTestPlan) { called <- p.ID }
	require.NoError(t, s.Run(ctx, 1))
	select {
	case got := <-called:
		require.Equal(t, id, got)
	case <-time.After(time.Second):
		t.Fatal("official runner was not queued")
	}
	r.busy = true
	require.ErrorIs(t, s.Run(ctx, 1), ErrAccountStatusCheckRunning)
	r.busy = false
	seconds := 4
	_, err := s.Update(ctx, 1, AccountStatusCheckInput{Enabled: statusCheckBool(true), TimeoutSeconds: &seconds})
	require.Error(t, err)
	minutes := 90
	seconds = 30
	view, err = s.Update(ctx, 1, AccountStatusCheckInput{Enabled: statusCheckBool(true), IntervalMinutes: &minutes, TimeoutSeconds: &seconds})
	require.NoError(t, err)
	require.Equal(t, 120, view.IntervalMinutes)
	require.Equal(t, 30, view.TimeoutSeconds)
	require.Equal(t, "deepseek-v4-flash", view.Model, "saving other fields keeps the model")

	// Clearing the model stops the check; the plan keeps its old model to pass the official save checks.
	view = statusCheckOn(t, s, 1, "")
	require.Equal(t, id, *view.PlanID)
	require.False(t, view.CheckEnabled)
	require.False(t, r.plans.plans[id].Enabled)
	require.Equal(t, "deepseek-v4-flash", r.plans.plans[id].ModelID)
	_, err = nextPlanRun(r.plans.plans[id], time.Now())
	require.NoError(t, err)
	require.ErrorIs(t, s.Run(ctx, 1), ErrAccountStatusCheckOff)
}

// 管理员在官方“定时测试计划”页面直接启停计划：账号管理显示、列表状态、手动检测与之后的保存都以计划实际开关为准，
// 账号编辑保存不会把在计划页关掉的检测重新打开。
func TestAccountStatusCheckFollowsOfficialPlanToggle(t *testing.T) {
	s, r := statusCheckHarness(t)
	ctx := context.Background()
	r.admin.accounts[1] = &Account{ID: 1, Platform: PlatformOpenAI, Type: AccountTypeAPIKey, Status: StatusActive}
	id := *statusCheckOn(t, s, 1, "gpt-6-astra").PlanID
	require.True(t, r.plans.plans[id].Enabled)

	// 官方计划页停用。
	r.plans.plans[id].Enabled = false
	view, err := s.Get(ctx, 1)
	require.NoError(t, err)
	require.True(t, view.Enabled)
	require.False(t, view.CheckEnabled)
	items, err := s.Status(ctx, []int64{1})
	require.NoError(t, err)
	require.False(t, items[0].CheckEnabled)
	require.ErrorIs(t, s.Run(ctx, 1), ErrAccountStatusCheckOff)
	// 账号编辑页只改间隔（表单带回当前显示的关闭状态）时仍保持关闭。
	minutes := 10
	view, err = s.Update(ctx, 1, AccountStatusCheckInput{Enabled: statusCheckBool(true), IntervalMinutes: &minutes})
	require.NoError(t, err)
	require.False(t, view.CheckEnabled)
	require.False(t, r.plans.plans[id].Enabled)
	require.False(t, r.rows[1].CheckEnabled, "保存的设置与计划实际状态对齐")
	require.Equal(t, "*/10 * * * *", r.plans.plans[id].CronExpression)

	// 官方计划页重新启用：账号管理随之显示开启，可手动检测。
	r.plans.plans[id].Enabled = true
	view, err = s.Get(ctx, 1)
	require.NoError(t, err)
	require.True(t, view.CheckEnabled)
	items, err = s.Status(ctx, []int64{1})
	require.NoError(t, err)
	require.True(t, items[0].CheckEnabled)
	require.NoError(t, s.Run(ctx, 1))

	// 在账号管理里关闭/打开仍按原方式同时写配置和计划。
	view, err = s.Update(ctx, 1, AccountStatusCheckInput{Enabled: statusCheckBool(true), CheckEnabled: statusCheckBool(false)})
	require.NoError(t, err)
	require.False(t, view.CheckEnabled)
	require.False(t, r.plans.plans[id].Enabled)
	view, err = s.Update(ctx, 1, AccountStatusCheckInput{Enabled: statusCheckBool(true), CheckEnabled: statusCheckBool(true)})
	require.NoError(t, err)
	require.True(t, view.CheckEnabled)
	require.True(t, r.plans.plans[id].Enabled)
	require.Empty(t, r.admin.updates)
}

var (
	statusCheckWrong  = []*ScheduledTestResult{{Status: "failed", ResponseText: "20", ErrorMessage: "answer_mismatch: expected 21"}}
	statusCheckRight  = []*ScheduledTestResult{{Status: "success", ResponseText: "21"}}
	statusCheckFailed = []*ScheduledTestResult{{Status: "failed", ErrorMessage: "timeout"}}
)

// statusCheckPolicyHarness: OpenAI accounts 1..n, schedulable, each with the given policy switches.
func statusCheckPolicyHarness(t *testing.T, policies ...[2]bool) (*AccountStatusCheckService, *statusCheckStore, func(int64) *ScheduledTestPlan) {
	t.Helper()
	s, r := statusCheckHarness(t)
	ctx := context.Background()
	for i := range policies {
		id := int64(i + 1)
		r.admin.accounts[id] = &Account{ID: id, Platform: PlatformOpenAI, Type: AccountTypeAPIKey, Status: StatusActive, Schedulable: true}
	}
	model := "gpt-6-astra"
	for i, p := range policies {
		_, err := s.Update(ctx, int64(i+1), AccountStatusCheckInput{Enabled: statusCheckBool(true), Model: &model,
			DisableOnDegraded: statusCheckBool(p[0]), ReopenOnRecovered: statusCheckBool(p[1])})
		require.NoError(t, err)
	}
	return s, r, func(id int64) *ScheduledTestPlan { return r.plans.plans[*r.rows[id].PlanID] }
}

// 降智时关闭调度（不开恢复）：答错关闭调度并停止自动检测；请求失败、答对、未开启、其他计划都不动账号。
func TestAccountStatusCheckClosesDegradedAccountAndStops(t *testing.T) {
	s, r, plan := statusCheckPolicyHarness(t, [2]bool{true, false}, [2]bool{false, false})
	ctx := context.Background()

	s.followStatusCheck(ctx, plan(1), statusCheckFailed)
	s.followStatusCheck(ctx, plan(1), statusCheckRight)
	s.followStatusCheck(ctx, plan(2), statusCheckWrong) // policy off
	other := copyStatusPlan(plan(1))
	other.PelicanConfig.RuleName = "admin quality rule"
	s.followStatusCheck(ctx, other, statusCheckWrong)
	require.Empty(t, r.admin.updates)
	require.True(t, plan(2).Enabled)

	s.followStatusCheck(ctx, plan(1), statusCheckWrong)
	require.Equal(t, []int64{1}, r.admin.updates)
	require.False(t, r.admin.accounts[1].Schedulable)
	require.True(t, r.admin.accounts[2].Schedulable)
	require.False(t, plan(1).Enabled, "without reopening the check stops with the account")
	view, err := s.Get(ctx, 1)
	require.NoError(t, err)
	require.False(t, view.CheckEnabled)
	require.True(t, view.Enabled && view.DisableOnDegraded, "the settings themselves stay as saved")
	require.NotNil(t, r.rows[1].DegradedClosedAt)

	// With the whole status check switched off for the account, nothing is closed either.
	r.admin.accounts[1].Schedulable = true
	_, err = s.Update(ctx, 1, AccountStatusCheckInput{Enabled: statusCheckBool(false)})
	require.NoError(t, err)
	s.followStatusCheck(ctx, plan(1), statusCheckWrong)
	require.Len(t, r.admin.updates, 1)
}

// 恢复后打开调度：降智关闭后继续检测，答对 21 重新打开；只打开本模块关掉的调度。
func TestAccountStatusCheckReopensRecoveredAccount(t *testing.T) {
	s, r, plan := statusCheckPolicyHarness(t, [2]bool{true, true}, [2]bool{true, true})
	ctx := context.Background()

	s.followStatusCheck(ctx, plan(1), statusCheckWrong)
	require.False(t, r.admin.accounts[1].Schedulable)
	require.True(t, plan(1).Enabled, "the check goes on while the account is closed")
	s.followStatusCheck(ctx, plan(1), statusCheckWrong)
	s.followStatusCheck(ctx, plan(1), statusCheckFailed)
	require.Equal(t, []int64{1}, r.admin.updates, "closed once; a failed request does not reopen")
	require.False(t, r.admin.accounts[1].Schedulable)

	s.followStatusCheck(ctx, plan(1), statusCheckRight)
	require.True(t, r.admin.accounts[1].Schedulable)
	require.Equal(t, []int64{1, 1}, r.admin.updates)
	require.Nil(t, r.rows[1].DegradedClosedAt)
	s.followStatusCheck(ctx, plan(1), statusCheckRight)
	require.Len(t, r.admin.updates, 2, "nothing left to reopen")

	// An account an administrator closed is not reopened by a correct answer, and a wrong answer on
	// it is not taken as closed by the check.
	r.admin.accounts[2].Schedulable = false
	s.followStatusCheck(ctx, plan(2), statusCheckWrong)
	s.followStatusCheck(ctx, plan(2), statusCheckRight)
	require.False(t, r.admin.accounts[2].Schedulable)
	require.Len(t, r.admin.updates, 2)
}

// 恢复后打开调度可以单独开启：没开降智关调度时没有要恢复的账号，不起作用。
func TestAccountStatusCheckReopenAloneDoesNothing(t *testing.T) {
	s, r, plan := statusCheckPolicyHarness(t, [2]bool{false, true})
	ctx := context.Background()
	view, err := s.Get(ctx, 1)
	require.NoError(t, err)
	require.True(t, view.ReopenOnRecovered)
	require.False(t, view.DisableOnDegraded)

	s.followStatusCheck(ctx, plan(1), statusCheckWrong)
	r.admin.accounts[1].Schedulable = false // closed by hand meanwhile
	s.followStatusCheck(ctx, plan(1), statusCheckRight)
	require.Empty(t, r.admin.updates)
	require.False(t, r.admin.accounts[1].Schedulable)
	require.True(t, plan(1).Enabled)
}

func TestAccountStatusCheckHearsTheRunner(t *testing.T) {
	runner := &ScheduledTestRunnerService{}
	NewAccountStatusCheckService(&statusCheckStore{}, &statusCheckAdmin{}, nil, runner)
	require.NotNil(t, runner.statusCheckFinished)
}
