//go:build unit

package middleware

import (
	"context"
	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type creditFallbackGroups struct {
	service.GroupRepository
	groups map[int64]*service.Group
}

func (r creditFallbackGroups) GetByIDLite(_ context.Context, id int64) (*service.Group, error) {
	return r.groups[id], nil
}

type creditFallbackRouter struct{}

func (creditFallbackRouter) ProbeAPIKeyGroup(context.Context, *service.Group, string, string) (service.APIKeyGroupAvailability, error) {
	return service.APIKeyGroupAvailability{Available: true}, nil
}

type creditFallbackSubscriptions struct {
	service.UserSubscriptionRepository
}

func (creditFallbackSubscriptions) GetActiveByUserIDAndGroupID(context.Context, int64, int64) (*service.UserSubscription, error) {
	return &service.UserSubscription{ID: 30, Status: service.StatusActive, ExpiresAt: time.Now().Add(time.Hour)}, nil
}

type nativeUtilityPolicyRates struct {
	service.UserGroupRateRepository
	denied map[int64][]string
}

func (r nativeUtilityPolicyRates) GetDeniedModelsByUserAndGroup(_ context.Context, _, groupID int64) ([]string, error) {
	return r.denied[groupID], nil
}
func (nativeUtilityPolicyRates) GetByUserAndGroup(context.Context, int64, int64) (*float64, error) {
	return nil, nil
}
func (nativeUtilityPolicyRates) GetRPMOverrideByUserAndGroup(context.Context, int64, int64) (*int, error) {
	return nil, nil
}

type nativeUtilityCapabilityProbe struct {
	t      *testing.T
	groups []int64
}

func (p *nativeUtilityCapabilityProbe) ProbeAPIKeyGroup(ctx context.Context, group *service.Group, model, kind string) (service.APIKeyGroupAvailability, error) {
	platform, ok := service.ResolvedTargetPlatformFromContext(ctx)
	require.True(p.t, ok)
	require.Equal(p.t, service.PlatformNovelAI, platform)
	require.Empty(p.t, model)
	require.Equal(p.t, "image", kind)
	p.groups = append(p.groups, group.ID)
	return service.APIKeyGroupAvailability{Available: true}, nil
}

func TestIsNovelAINativeUtilityRequest(t *testing.T) {
	for _, prefix := range []string{"/v1", ""} {
		for _, path := range []string{"/ai/upscale", "/ai/augment-image", "/ai/encode-vibe"} {
			require.True(t, IsNovelAINativeUtilityRequest(http.MethodPost, prefix+path))
			require.False(t, IsNovelAINativeUtilityRequest(http.MethodGet, prefix+path))
			require.False(t, IsNovelAINativeUtilityRequest(http.MethodPost, prefix+path+"/other"))
		}
		for _, path := range []string{"/ai/generate-image", "/ai/generate-image-stream", "/user/subscription", "/ai/generate-image/suggest-tags"} {
			require.False(t, IsNovelAINativeUtilityRequest(http.MethodPost, prefix+path))
		}
	}
}

func TestNovelAINativeUtilityGroupSelectionRetainsPolicies(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		name   string
		mutate func(*service.Group, *nativeUtilityPolicyRates)
	}{
		{"model_allowlist", func(g *service.Group, _ *nativeUtilityPolicyRates) {
			g.ModelAllowlist = service.GroupModelAllowlist{Enabled: true, Models: []string{"nai-diffusion-5-curated"}}
		}},
		{"user_denied_model", func(g *service.Group, rates *nativeUtilityPolicyRates) { rates.denied[g.ID] = []string{"gpt-4o"} }},
		{"image_permission", func(g *service.Group, _ *nativeUtilityPolicyRates) { g.AllowImageGeneration = false }},
		{"disabled_group", func(g *service.Group, _ *nativeUtilityPolicyRates) { g.Status = "disabled" }},
		{"exclusive_group", func(g *service.Group, _ *nativeUtilityPolicyRates) { g.IsExclusive = true }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			groups := map[int64]*service.Group{
				1: {ID: 1, Status: service.StatusActive, Platform: service.PlatformComposite, RateMultiplier: 0.01, AllowImageGeneration: true},
				2: {ID: 2, Status: service.StatusActive, Platform: service.PlatformNovelAI, RateMultiplier: 1, AllowImageGeneration: true},
			}
			rates := nativeUtilityPolicyRates{denied: map[int64][]string{}}
			tc.mutate(groups[1], &rates)
			key := &service.APIKey{ID: 7, UserID: 8, Status: service.StatusActive, GroupID: &groups[1].ID, GroupIDs: []int64{1, 2},
				Group: groups[1], User: &service.User{ID: 8, Status: service.StatusActive, Balance: 10}}
			cfg := &config.Config{RunMode: config.RunModeStandard}
			svc := service.NewAPIKeyService(nil, nil, creditFallbackGroups{groups: groups}, nil, rates, nil, cfg)
			probe := &nativeUtilityCapabilityProbe{t: t}
			svc.SetGroupRouter(probe)
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/ai/upscale", strings.NewReader(`{"model":"gpt-4o","image":"image"}`))
			c.Request.Header.Set("Content-Type", "application/json")
			selected, err := selectAPIKeyRequestGroup(c, svc, nil, cfg, key, false)
			require.NoError(t, err)
			require.Equal(t, int64(2), *selected.GroupID)
			require.Equal(t, []int64{2}, probe.groups, "policy-rejected group must never be probed")
			_, bound := service.ResolvedTargetPlatformFromContext(c.Request.Context())
			require.False(t, bound, "probe override must not alter downstream request routing")
		})
	}
}

func TestVipCreditNoConfigPreservesSubscriptionGroupFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	id := int64(1)
	groups := map[int64]*service.Group{1: {ID: 1, Status: service.StatusActive, RateMultiplier: 0.1, Platform: service.PlatformOpenAI}, 2: {ID: 2, Status: service.StatusActive, RateMultiplier: 1, Platform: service.PlatformOpenAI, SubscriptionType: service.SubscriptionTypeSubscription}}
	key := &service.APIKey{ID: 7, UserID: 8, Status: service.StatusActive, GroupID: &id, GroupIDs: []int64{1, 2}, Group: groups[1], User: &service.User{ID: 8, Status: service.StatusActive, Balance: 0}}
	svc := service.NewAPIKeyService(nil, nil, creditFallbackGroups{groups: groups}, creditFallbackSubscriptions{}, nil, nil, &config.Config{})
	svc.SetGroupRouter(creditFallbackRouter{})
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	got, err := selectAPIKeyRequestGroup(c, svc, nil, &config.Config{}, key, false)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Equal(t, int64(2), *got.GroupID, "zero-balance non-VIP must fall back to valid subscription rather than cheap unusable balance group")
}

func TestVipCreditBelowReservePreservesSubscriptionFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	id := int64(1)
	groups := map[int64]*service.Group{1: {ID: 1, Status: service.StatusActive, RateMultiplier: 0.1, Platform: service.PlatformOpenAI}, 2: {ID: 2, Status: service.StatusActive, RateMultiplier: 1, Platform: service.PlatformOpenAI, SubscriptionType: service.SubscriptionTypeSubscription}}
	cfg := &config.Config{}
	cfg.Billing.MinimumBalanceReserve = 0.01
	key := &service.APIKey{ID: 7, UserID: 8, Status: service.StatusActive, GroupID: &id, GroupIDs: []int64{1, 2}, Group: groups[1], User: &service.User{ID: 8, Status: service.StatusActive, Balance: 0.005}}
	svc := service.NewAPIKeyService(nil, nil, creditFallbackGroups{groups: groups}, creditFallbackSubscriptions{}, nil, nil, cfg)
	svc.SetGroupRouter(creditFallbackRouter{})
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil)
	got, err := selectAPIKeyRequestGroup(c, svc, nil, cfg, key, false)
	require.NoError(t, err)
	require.Equal(t, int64(2), *got.GroupID)
}
