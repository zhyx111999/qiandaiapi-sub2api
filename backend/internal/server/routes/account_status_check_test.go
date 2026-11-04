//go:build unit

package routes

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/handler"
	adminhandler "github.com/Wei-Shaw/sub2api/internal/handler/admin"
	"github.com/Wei-Shaw/sub2api/internal/pkg/adminaccess"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type statusCheckRouteStore struct {
	plans *statusCheckRoutePlans
	mu    sync.Mutex
	rows  map[int64]service.AccountStatusCheckConfig
}

func (s *statusCheckRouteStore) WithAccountLock(ctx context.Context, _ int64, fn func(context.Context) error) error {
	return fn(ctx)
}
func (s *statusCheckRouteStore) Get(_ context.Context, id int64) (*service.AccountStatusCheckConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if row, ok := s.rows[id]; ok {
		return &row, nil
	}
	return nil, nil
}
func (s *statusCheckRouteStore) Save(_ context.Context, cfg *service.AccountStatusCheckConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rows[cfg.AccountID] = *cfg
	return nil
}
func (s *statusCheckRouteStore) SavePlan(ctx context.Context, cfg *service.AccountStatusCheckConfig, plan *service.ScheduledTestPlan) error {
	var saved *service.ScheduledTestPlan
	var err error
	if plan.ID == 0 {
		saved, err = s.plans.Create(ctx, plan)
	} else {
		saved, err = s.plans.Update(ctx, plan)
	}
	if err != nil {
		return err
	}
	cfg.PlanID = &saved.ID
	return s.Save(ctx, cfg)
}

func (s *statusCheckRouteStore) ListStatus(_ context.Context, ids []int64) ([]service.AccountStatusCheckStatusRow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []service.AccountStatusCheckStatusRow
	for _, id := range ids {
		if row, ok := s.rows[id]; ok {
			out = append(out, service.AccountStatusCheckStatusRow{AccountID: id, EffectiveModel: "gpt-6-astra", Config: row, Platform: service.PlatformOpenAI, AccountStatus: service.StatusActive})
		}
	}
	return out, nil
}
func (s *statusCheckRouteStore) RecentResults(context.Context, []int64, int) (map[int64][]service.AccountStatusCheckResult, error) {
	return map[int64][]service.AccountStatusCheckResult{}, nil
}
func (s *statusCheckRouteStore) MarkPlanDue(context.Context, int64) (bool, error) { return true, nil }

type statusCheckRouteAdmin struct {
	service.AdminService
	mu       sync.Mutex
	accounts map[int64]*service.Account
}

func (a *statusCheckRouteAdmin) GetAccount(_ context.Context, id int64) (*service.Account, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	account, ok := a.accounts[id]
	if !ok {
		return nil, service.ErrAccountNotFound
	}
	copied := *account
	return &copied, nil
}
func (a *statusCheckRouteAdmin) UpdateAccount(_ context.Context, id int64, in *service.UpdateAccountInput) (*service.Account, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.accounts[id].ProxyID = in.ProxyID
	copied := *a.accounts[id]
	return &copied, nil
}

type statusCheckRoutePlans struct {
	service.ScheduledTestPlanRepository
	mu    sync.Mutex
	plans map[int64]service.ScheduledTestPlan
}

func (p *statusCheckRoutePlans) Create(_ context.Context, plan *service.ScheduledTestPlan) (*service.ScheduledTestPlan, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	plan.ID = int64(len(p.plans) + 1)
	p.plans[plan.ID] = *plan
	return plan, nil
}
func (p *statusCheckRoutePlans) GetByID(_ context.Context, id int64) (*service.ScheduledTestPlan, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	plan, ok := p.plans[id]
	if !ok {
		return nil, sql.ErrNoRows
	}
	return &plan, nil
}
func (p *statusCheckRoutePlans) ListByAccountID(context.Context, int64) ([]*service.ScheduledTestPlan, error) {
	return nil, nil
}
func (p *statusCheckRoutePlans) Update(_ context.Context, plan *service.ScheduledTestPlan) (*service.ScheduledTestPlan, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.plans[plan.ID] = *plan
	return plan, nil
}

type statusCheckRouteEnv struct {
	router *gin.Engine
}

func newStatusCheckRouteEnv(t *testing.T) *statusCheckRouteEnv {
	t.Helper()
	gin.SetMode(gin.TestMode)
	proxyID := int64(9)
	admin := &statusCheckRouteAdmin{accounts: map[int64]*service.Account{
		1: {ID: 1, Platform: service.PlatformOpenAI, Type: service.AccountTypeOAuth, ProxyID: &proxyID},
		2: {ID: 2, Platform: service.PlatformOpenAI, Type: service.AccountTypeAPIKey},
		3: {ID: 3, Platform: service.PlatformGemini, Type: service.AccountTypeAPIKey},
	}}
	planRepo := &statusCheckRoutePlans{plans: map[int64]service.ScheduledTestPlan{}}
	plans := service.NewScheduledTestService(planRepo, nil)
	svc := service.NewAccountStatusCheckService(&statusCheckRouteStore{rows: map[int64]service.AccountStatusCheckConfig{}, plans: planRepo}, admin, plans, nil)
	router := gin.New()
	registerAccountStatusCheckRoutes(router.Group("/api/v1/admin"), &handler.Handlers{Admin: &handler.AdminHandlers{AccountStatusCheck: adminhandler.NewAccountStatusCheckHandler(svc)}})
	return &statusCheckRouteEnv{router: router}
}

type statusCheckRouteReply struct {
	Code   int             `json:"code"`
	Reason string          `json:"reason"`
	Data   json.RawMessage `json:"data"`
}

func (e *statusCheckRouteEnv) call(t *testing.T, method, path, body string) (int, statusCheckRouteReply) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, req)
	var reply statusCheckRouteReply
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &reply), rec.Body.String())
	return rec.Code, reply
}

var statusCheckRoutes = []struct{ method, path, concrete string }{
	{http.MethodGet, "/api/v1/admin/account-status-check/capabilities", "/api/v1/admin/account-status-check/capabilities"},
	{http.MethodGet, "/api/v1/admin/account-status-check/status", "/api/v1/admin/account-status-check/status?account_ids=1"},
	{http.MethodGet, "/api/v1/admin/account-status-check/accounts/:id", "/api/v1/admin/account-status-check/accounts/1"},
	{http.MethodPut, "/api/v1/admin/account-status-check/accounts/:id", "/api/v1/admin/account-status-check/accounts/1"},
	{http.MethodPost, "/api/v1/admin/account-status-check/accounts/:id/run", "/api/v1/admin/account-status-check/accounts/1/run"},
}

func TestAccountStatusCheckRoutesFollowTheContract(t *testing.T) {
	env := newStatusCheckRouteEnv(t)
	const base = "/api/v1/admin/account-status-check"

	code, reply := env.call(t, http.MethodGet, base+"/capabilities", "")
	require.Equal(t, http.StatusOK, code)
	require.JSONEq(t, `{"defaults":{"interval_minutes":5,"reasoning_effort":"low","timeout_seconds":600,"disable_on_degraded":false,"reopen_on_recovered":false},
		"limits":{"interval_min":1,"interval_max":1440,"timeout_min":5,"timeout_max":600},"efforts":["none","low","medium","high","xhigh"]}`, string(reply.Data))

	code, reply = env.call(t, http.MethodGet, base+"/accounts/1", "")
	require.Equal(t, http.StatusOK, code)
	require.JSONEq(t, `{"account_id":1,"configured":false,"enabled":false,"check_enabled":true,"interval_minutes":5,"model":"gpt-6.1-sol",
		"reasoning_effort":"low","timeout_seconds":600,"disable_on_degraded":false,"reopen_on_recovered":false,"plan_id":null,"inherited_from_account_id":null}`, string(reply.Data))

	for _, tc := range []struct {
		method, path, body string
		code               int
		reason             string
	}{
		{http.MethodGet, base + "/accounts/abc", "", 400, "ACCOUNT_STATUS_CHECK_INVALID"},
		{http.MethodGet, base + "/accounts/3", "", 400, "ACCOUNT_STATUS_CHECK_OPENAI_ONLY"},
		{http.MethodGet, base + "/accounts/4", "", 404, "ACCOUNT_NOT_FOUND"},
		{http.MethodPut, base + "/accounts/3", `{"enabled":true}`, 400, "ACCOUNT_STATUS_CHECK_OPENAI_ONLY"},
		{http.MethodPut, base + "/accounts/1", `{"enabled":`, 400, "ACCOUNT_STATUS_CHECK_INVALID"},
		{http.MethodPut, base + "/accounts/1", `{"enabled":true,"interval_minutes":0}`, 400, "ACCOUNT_STATUS_CHECK_INVALID"},
		{http.MethodPost, base + "/accounts/1/run", "", 409, "ACCOUNT_STATUS_CHECK_DISABLED"},
		{http.MethodGet, base + "/status?account_ids=1,abc", "", 400, "ACCOUNT_STATUS_CHECK_INVALID"},
		{http.MethodGet, base + "/status?account_ids=" + strings.Repeat("1,", 201), "", 400, "ACCOUNT_STATUS_CHECK_INVALID"},
	} {
		code, reply := env.call(t, tc.method, tc.path, tc.body)
		require.Equal(t, tc.code, code, tc.method+" "+tc.path)
		require.Equal(t, tc.reason, reply.Reason, tc.method+" "+tc.path)
	}

	code, reply = env.call(t, http.MethodPut, base+"/accounts/1",
		`{"enabled":true,"check_enabled":true,"interval_minutes":2,"model":"gpt-6-astra","reasoning_effort":"low","timeout_seconds":600,"disable_on_degraded":true,"reopen_on_recovered":true}`)
	require.Equal(t, http.StatusOK, code, string(reply.Data))
	var view map[string]any
	require.NoError(t, json.Unmarshal(reply.Data, &view))
	require.Equal(t, true, view["configured"])
	require.Equal(t, true, view["enabled"])
	require.NotContains(t, view, "proxy_id")
	require.EqualValues(t, 2, view["interval_minutes"])
	require.Equal(t, "gpt-6-astra", view["model"])
	require.NotContains(t, view, "effective_model")
	require.Equal(t, true, view["disable_on_degraded"])
	require.Equal(t, true, view["reopen_on_recovered"])
	require.NotNil(t, view["plan_id"])

	code, reply = env.call(t, http.MethodGet, base+"/status?account_ids=1,2", "")
	require.Equal(t, http.StatusOK, code)
	require.JSONEq(t, `{"items":[{"account_id":1,"enabled":true,"state":"unknown","latest":null,"history":[],"matched":0,"completed":0,
		"rate":null,"model":"gpt-6-astra","reasoning_effort":"low","interval_minutes":2,"check_enabled":true,"inherited_from_account_id":null}]}`, string(reply.Data))

	code, reply = env.call(t, http.MethodGet, base+"/status", "")
	require.Equal(t, http.StatusOK, code)
	require.JSONEq(t, `{"items":[]}`, string(reply.Data))

	code, reply = env.call(t, http.MethodPost, base+"/accounts/1/run", "")
	require.Equal(t, http.StatusOK, code)
	require.JSONEq(t, `{"started":true}`, string(reply.Data))
}

func TestAccountStatusCheckRoutesStayAdministratorOnly(t *testing.T) {
	gin.SetMode(gin.TestMode)
	statusCheck := adminhandler.NewAccountStatusCheckHandler(nil)
	pass := func(c *gin.Context) { c.Next() }

	// Mounted under the shared admin chain for ordinary administrators.
	r := gin.New()
	RegisterAdminRoutes(r.Group("/api/v1"), &handler.Handlers{Admin: &handler.AdminHandlers{AccountStatusCheck: statusCheck}},
		middleware.AdminAuthMiddleware(pass), middleware.AuditLogMiddleware(pass), middleware.StepUpAuthMiddleware(pass), nil, nil)
	registered := map[string]bool{}
	for _, route := range r.Routes() {
		registered[route.Method+" "+route.Path] = true
	}
	for _, route := range statusCheckRoutes {
		require.True(t, registered[route.method+" "+route.path], route.path)
		// Observers and scoped admin keys have no grant for these routes.
		require.False(t, middleware.ObserverAccountRouteAllowed(route.method, route.path), route.path)
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/admin/account-status-check/capabilities", nil))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	// Even a scoped admin key holding every catalog permission is rejected.
	policy := adminaccess.Policy{Rules: []adminaccess.Rule{{AllGroups: true, IncludeUngrouped: true}}}
	for _, permission := range adminaccess.PermissionCatalog() {
		if permission.Scope == "global" {
			policy.GlobalPermissions = append(policy.GlobalPermissions, permission.ID)
		} else {
			policy.Rules[0].Permissions = append(policy.Rules[0].Permissions, permission.ID)
		}
	}
	for _, route := range statusCheckRoutes {
		require.False(t, adminaccess.RouteAllowed(policy, route.method, route.path), route.path)
	}
	keys := &scopedRouteKeys{}
	settings := service.NewSettingService(nil, nil)
	settings.SetScopedAdminKeyRepository(keys)
	key, _, err := settings.CreateScopedAdminKey(context.Background(), service.ScopedAdminKeyInput{Name: "状态检测", Enabled: true, Policy: policy}, 9)
	require.NoError(t, err)
	auth := middleware.NewAdminAuthMiddleware(nil, service.NewUserService(&scopedRouteUsers{}, nil, nil, nil), settings, nil)
	accountHandler := adminhandler.NewAccountHandler(&scopedRouteAccounts{t: t}, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil)
	scoped := gin.New()
	RegisterAdminRoutes(scoped.Group("/api/v1"), &handler.Handlers{Admin: &handler.AdminHandlers{Account: accountHandler, AccountStatusCheck: statusCheck}},
		auth, middleware.AuditLogMiddleware(pass), middleware.StepUpAuthMiddleware(pass), nil, nil)
	for _, route := range statusCheckRoutes {
		req := httptest.NewRequest(route.method, route.concrete, strings.NewReader(`{"enabled":true}`))
		req.Header.Set("x-api-key", key)
		rec := httptest.NewRecorder()
		scoped.ServeHTTP(rec, req)
		require.Equal(t, http.StatusForbidden, rec.Code, route.method+" "+route.path+": "+rec.Body.String())
	}
}
