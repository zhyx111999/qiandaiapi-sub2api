//go:build unit

package handler

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	middleware2 "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type novelAINativeUsageSpy struct {
	service.UsageLogRepository
	calls int
}

func (r *novelAINativeUsageSpy) Create(context.Context, *service.UsageLog) (bool, error) {
	r.calls++
	return true, nil
}

func newNovelAINativeHandler(t *testing.T) (*OpenAIGatewayHandler, *grokMediaSlotsCache, *grokMediaSlotUpstream, *novelAINativeUsageSpy) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{RunMode: config.RunModeSimple}
	cfg.Default.RateMultiplier = 1
	accounts := []service.Account{{
		ID: 1, Platform: service.PlatformNovelAI, Type: service.AccountTypeAPIKey,
		Status: service.StatusActive, Schedulable: true, Concurrency: 5, GroupIDs: []int64{24},
		Credentials: map[string]any{"base_url": "https://example.com/v1",
			"model_mapping": map[string]any{"nai-diffusion-4-5-full": "nai-diffusion-4-5-full"}},
	}}
	repo := openAIImagesFailoverAccountRepo{accounts: accounts}
	slots := &grokMediaSlotsCache{accounts: map[string]int64{}, users: map[string]int64{}}
	concurrency := service.NewConcurrencyService(slots)
	upstream := &grokMediaSlotUpstream{}
	usage := &novelAINativeUsageSpy{}
	billing := service.NewBillingCacheService(nil, nil, nil, nil, nil, nil, cfg, nil)
	t.Cleanup(billing.Stop)
	gateway := service.NewOpenAIGatewayService(repo, nil, usage, nil, nil, nil, nil, nil, cfg, nil,
		concurrency, service.NewBillingService(cfg, nil), nil, billing, upstream, nil, nil, nil, nil, nil, nil, nil, nil)
	h := NewOpenAIGatewayHandler(gateway, concurrency, billing,
		service.NewAPIKeyService(nil, nil, nil, nil, nil, nil, cfg), nil, nil, nil, nil, cfg)
	return h, slots, upstream, usage
}

func novelAINativeContext(method, path, body string) (*gin.Context, *httptest.ResponseRecorder) {
	c, w := grokMediaSlotContext(context.Background(), false)
	c.Request = httptest.NewRequest(method, path, strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	key, _ := middleware2.GetAPIKeyFromContext(c)
	key.Group.Platform = service.PlatformNovelAI
	key.Group.RateMultiplier = 1
	return c, w
}

func TestNovelAISubscriptionFixedBodyAndAuthentication(t *testing.T) {
	h := &OpenAIGatewayHandler{}
	c, w := novelAINativeContext(http.MethodGet, "/user/subscription", "")
	h.NovelAISubscription(c)
	require.Equal(t, http.StatusOK, w.Code)
	require.Contains(t, w.Header().Get("Content-Type"), "application/json")
	require.JSONEq(t, `{"tier":3,"active":true,"expiresAt":4102444800,"trainingStepsLeft":{"fixedTrainingStepsLeft":10000,"purchasedTrainingSteps":0},"usage":{"percent":100,"purchasedPercent":0,"isNegative":false,"timeUntilNextPercent":60}}`, w.Body.String())

	w = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/user/subscription", nil)
	h.NovelAISubscription(c)
	require.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestNovelAISuggestTagsDoesNotAcquireGenerationSlotsOrBill(t *testing.T) {
	h, slots, upstream, usage := newNovelAINativeHandler(t)
	slots.full = true
	upstream.call = func(req *http.Request, id int64) (*http.Response, error) {
		require.Equal(t, http.MethodGet, req.Method)
		require.Equal(t, "prompt=1girl%2C+&model=unknown-model&type=animev5", req.URL.RawQuery)
		deadline, ok := req.Context().Deadline()
		require.True(t, ok)
		require.LessOrEqual(t, time.Until(deadline), 4500*time.Millisecond)
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"text/plain"}},
			Body: io.NopCloser(strings.NewReader(`{"tags":[{"tag":"1girl"}]}`))}, nil
	}
	c, w := novelAINativeContext(http.MethodGet, "/ai/generate-image/suggest-tags?prompt=1girl%2C+&model=unknown-model&type=animev5", "")
	key, _ := middleware2.GetAPIKeyFromContext(c)
	key.Group.AllowImageGeneration = false
	key.User.Balance = 0
	h.billingCacheService = nil // The free path must not depend on the billing pipeline.
	h.NovelAISuggestTags(c)
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "text/plain", w.Header().Get("Content-Type"))
	require.Equal(t, 1, upstream.calls)
	require.Zero(t, slots.acquired)
	require.Zero(t, slots.userAcquired)
	require.Zero(t, usage.calls)
	slots.assertReleased(t)
}

func TestNovelAINativeUpstreamFailuresAreNotRetriedOrBilled(t *testing.T) {
	for _, tc := range []struct{ path, body string }{
		{"/ai/upscale", `{"model":"bogus-model-probe","image":"test"}`},
		{"/ai/encode-vibe", `{"model":"bogus-model-probe","image":"test"}`},
		{"/ai/augment-image", `{"req_type":"bogus-probe","width":8,"height":8,"image":"test"}`},
	} {
		for _, status := range []int{400, 429, 500, 503} {
			t.Run(tc.path+"/"+http.StatusText(status), func(t *testing.T) {
				h, slots, upstream, usage := newNovelAINativeHandler(t)
				upstream.call = func(req *http.Request, _ int64) (*http.Response, error) {
					body, err := io.ReadAll(req.Body)
					require.NoError(t, err)
					require.Equal(t, tc.body, string(body))
					return &http.Response{StatusCode: status, Header: http.Header{"Content-Type": {"application/json"}},
						Body: io.NopCloser(strings.NewReader(`{"statusCode":400,"message":"upstream validation"}`))}, nil
				}
				c, w := novelAINativeContext(http.MethodPost, tc.path, tc.body)
				h.NovelAI(c)
				require.Equal(t, status, w.Code, w.Body.String())
				require.Equal(t, `{"statusCode":400,"message":"upstream validation"}`, w.Body.String())
				require.Equal(t, 1, upstream.calls)
				require.Zero(t, usage.calls)
				slots.assertReleased(t)
			})
		}
	}
}

func TestReserveNovelAINativeChargeUsesEndpointQuoteAndReleases(t *testing.T) {
	cache := newHandlerInflightCache(0.03)
	cfg := &config.Config{}
	cfg.Default.RateMultiplier = 1
	cfg.Billing.InflightReservation = config.InflightReservationConfig{Enabled: true, TTLSeconds: 60}
	billing := service.NewBillingCacheService(cache, nil, nil, nil, nil, nil, cfg, nil)
	t.Cleanup(billing.Stop)
	gateway := service.NewOpenAIGatewayService(nil, nil, nil, nil, nil, nil, nil, nil, cfg, nil,
		nil, nil, nil, billing, nil, nil, nil, nil, nil, nil, nil, nil, nil)
	h := &OpenAIGatewayHandler{gatewayService: gateway, billingCacheService: billing}
	groupID := int64(24)
	key := &service.APIKey{User: &service.User{ID: 1}, GroupID: &groupID, Group: &service.Group{ID: groupID, RateMultiplier: 2}}
	accountRate := 1.5
	account := &service.Account{GroupRateMultiplier: &accountRate}
	quote := 0.01
	req := &service.NovelAIRequest{NativeCostUSD: &quote}
	done, err := h.reserveNovelAINativeCharge(newInflightTestGinContext(), key, nil, account, req)
	require.NoError(t, err)
	require.Equal(t, 1, cache.count())
	cache.mu.Lock()
	for _, amount := range cache.res {
		require.InDelta(t, 0.03, amount, 1e-12)
	}
	cache.mu.Unlock()
	_, err = h.reserveNovelAINativeCharge(newInflightTestGinContext(), key, nil, account, req)
	require.ErrorIs(t, err, service.ErrInsufficientBalance)
	done()
	require.Zero(t, cache.count(), "upstream failure must release the reservation without a bill")

	quote = 0
	done, err = h.reserveNovelAINativeCharge(newInflightTestGinContext(), key, nil, account, req)
	require.NoError(t, err)
	done()
	require.Zero(t, cache.count(), "an explicitly free tool must not reserve the generation model price")
}
