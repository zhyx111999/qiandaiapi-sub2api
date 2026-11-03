//go:build unit

package service

import (
	"context"
	"database/sql"
	"slices"
	"sync"
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
	lock    sync.Mutex
	rows    map[int64]AccountStatusCheckConfig
	admin   *statusCheckAdmin
	plans   *statusCheckPlans
	results map[int64][]AccountStatusCheckResult
	busy    bool
	saves   int
}

func (r *statusCheckStore) WithAccountLock(ctx context.Context, _ int64, fn func(context.Context) error) error {
	r.lock.Lock()
	defer r.lock.Unlock()
	return fn(ctx)
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

func (r *statusCheckStore) ListReconcileAccountIDs(context.Context, int) ([]int64, error) {
	var ids []int64
	for id, a := range r.admin.accounts {
		if a.Platform == PlatformOpenAI && !a.IsShadow() && !r.admin.deleted[id] {
			ids = append(ids, id)
		}
	}
	return ids, nil
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

// 所有 OpenAI 类型自动配置；默认只观察，不改代理或调度字段。
func TestAccountStatusCheckAllOpenAITypesDefaultOn(t *testing.T) {
	s, r := statusCheckHarness(t)
	for i, kind := range []string{AccountTypeOAuth, AccountTypeAPIKey, AccountTypeSetupToken, "other"} {
		id := int64(i + 1)
		r.admin.accounts[id] = &Account{ID: id, Platform: PlatformOpenAI, Type: kind, Status: StatusActive, ProxyID: statusCheckID(8)}
	}
	r.admin.accounts[8] = &Account{ID: 8, Platform: PlatformGemini, Type: AccountTypeAPIKey}
	r.admin.accounts[9] = &Account{ID: 9, Platform: PlatformOpenAI, Type: AccountTypeOAuth, ParentAccountID: statusCheckID(1)}
	s.sweep(context.Background())
	require.Len(t, r.rows, 4)
	require.Equal(t, 4, r.plans.creates)
	require.Empty(t, r.admin.updates)
	for _, cfg := range r.rows {
		require.True(t, cfg.Enabled && cfg.CheckEnabled)
		require.NotNil(t, cfg.PlanID)
		p := r.plans.plans[*cfg.PlanID]
		require.Equal(t, "*/5 * * * *", p.CronExpression)
		require.False(t, p.AutoRecover)
		require.Nil(t, p.PelicanConfig.Quality)
		require.True(t, accountStatusCheckObservation(p.PelicanConfig), "默认状态检查必须只观测，不标错或停调")
		require.Equal(t, CandyPrompt, p.PelicanConfig.Prompt)
	}
	s.sweep(context.Background())
	require.Equal(t, 4, r.plans.creates)
	require.Zero(t, r.plans.updates)
	// 影子沿用同一计划，不能用子账号编辑或重复发检查。
	view, err := s.Get(context.Background(), 9)
	require.NoError(t, err)
	require.Equal(t, int64(1), *view.InheritedFromAccountID)
	_, err = s.Update(context.Background(), 9, AccountStatusCheckInput{Enabled: statusCheckBool(true)})
	require.ErrorIs(t, err, ErrAccountStatusCheckInherited)
	require.ErrorIs(t, s.Run(context.Background(), 9), ErrAccountStatusCheckInherited)
}

func TestAccountStatusCheckReadOnlyStatusAndHistory(t *testing.T) {
	s, r := statusCheckHarness(t)
	r.admin.accounts[1] = &Account{ID: 1, Platform: PlatformOpenAI, Type: AccountTypeAPIKey, Status: StatusActive}
	ctx := context.Background()
	items, err := s.Status(ctx, []int64{1, 1})
	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Equal(t, AccountStatusCheckStateUnknown, items[0].State)
	require.True(t, items[0].Enabled)
	require.Zero(t, r.saves)
	s.sweep(ctx)
	id := *r.rows[1].PlanID
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

// 手动关闭的检测不会被后台补齐重新打开；重新打开沿用原计划。
func TestAccountStatusCheckManualOff(t *testing.T) {
	s, r := statusCheckHarness(t)
	ctx := context.Background()
	r.admin.accounts[1] = &Account{ID: 1, Platform: PlatformOpenAI, Type: AccountTypeOAuth}
	s.sweep(ctx)
	id := *r.rows[1].PlanID
	_, err := s.Update(ctx, 1, AccountStatusCheckInput{Enabled: statusCheckBool(true), CheckEnabled: statusCheckBool(false)})
	require.NoError(t, err)
	s.sweep(ctx)
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
	a := &Account{ID: 1, Platform: PlatformOpenAI, Type: AccountTypeAPIKey}
	cfg, p, err := InitialAccountStatusCheck(a, time.Now())
	require.NoError(t, err)
	require.True(t, cfg.Enabled)
	require.False(t, cfg.DisableOnDegraded, "closing degraded accounts is opt-in")
	require.True(t, p.NextRunAt.After(time.Now()))
	p.PelicanConfig.StatusCheckTimeoutSeconds = 27
	require.Equal(t, 27*time.Second, accountStatusCheckPlanTimeout(p, 10*time.Minute))
	other := *p
	other.PelicanConfig = &PelicanTestConfig{RuleName: "admin quality rule", Prompt: CandyPrompt}
	require.Equal(t, 10*time.Minute, accountStatusCheckPlanTimeout(&other, 10*time.Minute), "other plans keep the runner's limit")
	require.False(t, accountStatusCheckObservation(other.PelicanConfig))
	require.False(t, AccountStatusCheckAppliesOnCreate(&Account{Platform: PlatformGemini}))
	require.False(t, AccountStatusCheckAppliesOnCreate(&Account{Platform: PlatformOpenAI, ParentAccountID: statusCheckID(1)}))
}

func TestAccountStatusCheckModelAndRun(t *testing.T) {
	s, r := statusCheckHarness(t)
	ctx := context.Background()
	a := &Account{ID: 1, Platform: PlatformOpenAI, Type: AccountTypeAPIKey, Credentials: map[string]any{"model_mapping": map[string]any{"deepseek-v4-flash": "deepseek-v4-flash", "gpt-image-2": "gpt-image-2"}}}
	r.admin.accounts[1] = a
	cfg, p, err := InitialAccountStatusCheck(a, time.Now())
	require.NoError(t, err)
	require.Empty(t, cfg.Model)
	require.Equal(t, "deepseek-v4-flash", p.ModelID)
	s.sweep(ctx)
	called := make(chan int64, 1)
	s.runPlan = func(p *ScheduledTestPlan) { called <- p.ID }
	require.NoError(t, s.Run(ctx, 1))
	select {
	case id := <-called:
		require.Equal(t, *r.rows[1].PlanID, id)
	case <-time.After(time.Second):
		t.Fatal("official runner was not queued")
	}
	r.busy = true
	require.ErrorIs(t, s.Run(ctx, 1), ErrAccountStatusCheckRunning)
	model := "gpt-image-2"
	_, err = s.Update(ctx, 1, AccountStatusCheckInput{Enabled: statusCheckBool(true), Model: &model})
	require.Error(t, err)
	seconds := 4
	_, err = s.Update(ctx, 1, AccountStatusCheckInput{Enabled: statusCheckBool(true), TimeoutSeconds: &seconds})
	require.Error(t, err)
	minutes := 90
	seconds = 30
	view, err := s.Update(ctx, 1, AccountStatusCheckInput{Enabled: statusCheckBool(true), IntervalMinutes: &minutes, TimeoutSeconds: &seconds})
	require.NoError(t, err)
	require.Equal(t, 120, view.IntervalMinutes)
	require.Equal(t, 30, view.TimeoutSeconds)
	onlyImage := &Account{ID: 2, Platform: PlatformOpenAI, Type: AccountTypeAPIKey, Credentials: map[string]any{"model_mapping": map[string]any{"gpt-image-2": "gpt-image-2"}}}
	_, none, err := InitialAccountStatusCheck(onlyImage, time.Now())
	require.NoError(t, err)
	require.Nil(t, none)
	// 若账号原来有文本计划，后来只剩图片模型，关闭计划仍能通过官方保存校验。
	disabled := accountStatusCheckPlan(&ScheduledTestPlan{ID: 9, AccountID: 2, ModelID: "old-text-model"}, onlyImage, defaultAccountStatusCheckConfig(2))
	require.False(t, disabled.Enabled)
	require.Equal(t, "old-text-model", disabled.ModelID)
	_, err = nextPlanRun(disabled, time.Now())
	require.NoError(t, err)
}

// 管理员在官方“定时测试计划”页面直接启停计划：账号管理显示、列表状态、手动检测与之后的保存都以计划实际开关为准，
// 后台补齐和账号编辑保存都不会把在计划页关掉的检测重新打开。
func TestAccountStatusCheckFollowsOfficialPlanToggle(t *testing.T) {
	s, r := statusCheckHarness(t)
	ctx := context.Background()
	r.admin.accounts[1] = &Account{ID: 1, Platform: PlatformOpenAI, Type: AccountTypeAPIKey, Status: StatusActive}
	s.sweep(ctx)
	id := *r.rows[1].PlanID
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
	updates := r.plans.updates
	s.sweep(ctx)
	require.False(t, r.plans.plans[id].Enabled, "后台补齐不能重新打开")
	require.Equal(t, updates, r.plans.updates)
	require.False(t, r.rows[1].CheckEnabled, "保存的设置与计划实际状态对齐")
	// 账号编辑页只改间隔（表单带回当前显示的关闭状态）时仍保持关闭。
	minutes := 10
	view, err = s.Update(ctx, 1, AccountStatusCheckInput{Enabled: statusCheckBool(true), IntervalMinutes: &minutes})
	require.NoError(t, err)
	require.False(t, view.CheckEnabled)
	require.False(t, r.plans.plans[id].Enabled)
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

// 降智时关闭调度：只在开启该策略且答错（降智）时关闭；请求失败、答对、未开启、其他计划都不动账号。
func TestAccountStatusCheckClosesDegradedAccount(t *testing.T) {
	s, r := statusCheckHarness(t)
	ctx := context.Background()
	for id := int64(1); id <= 2; id++ {
		r.admin.accounts[id] = &Account{ID: id, Platform: PlatformOpenAI, Type: AccountTypeAPIKey, Status: StatusActive, Schedulable: true}
	}
	s.sweep(ctx)
	view, err := s.Update(ctx, 1, AccountStatusCheckInput{Enabled: statusCheckBool(true), DisableOnDegraded: statusCheckBool(true)})
	require.NoError(t, err)
	require.True(t, view.DisableOnDegraded)
	plan := func(id int64) *ScheduledTestPlan { return r.plans.plans[*r.rows[id].PlanID] }
	wrong := []*ScheduledTestResult{{Status: "failed", ResponseText: "20", ErrorMessage: "answer_mismatch: expected 21"}}

	s.closeIfDegraded(ctx, plan(1), []*ScheduledTestResult{{Status: "failed", ErrorMessage: "timeout"}})
	s.closeIfDegraded(ctx, plan(1), []*ScheduledTestResult{{Status: "success", ResponseText: "21"}})
	s.closeIfDegraded(ctx, plan(2), wrong) // policy off
	other := copyStatusPlan(plan(1))
	other.PelicanConfig.RuleName = "admin quality rule"
	s.closeIfDegraded(ctx, other, wrong)
	require.Empty(t, r.admin.updates)

	s.closeIfDegraded(ctx, plan(1), wrong)
	require.Equal(t, []int64{1}, r.admin.updates)
	require.False(t, r.admin.accounts[1].Schedulable)
	require.True(t, r.admin.accounts[2].Schedulable)

	// With the whole status check switched off for the account, nothing is closed either.
	_, err = s.Update(ctx, 1, AccountStatusCheckInput{Enabled: statusCheckBool(false)})
	require.NoError(t, err)
	s.closeIfDegraded(ctx, plan(1), wrong)
	require.Len(t, r.admin.updates, 1)
}

func TestAccountStatusCheckHearsTheRunner(t *testing.T) {
	runner := &ScheduledTestRunnerService{}
	NewAccountStatusCheckService(&statusCheckStore{}, &statusCheckAdmin{}, nil, runner)
	require.NotNil(t, runner.statusCheckFinished)
}
