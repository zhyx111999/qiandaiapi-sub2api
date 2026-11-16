package routes

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/Wei-Shaw/sub2api/internal/handler"
	servermiddleware "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func newGatewayRoutesTestRouter(platform ...string) *gin.Engine {
	return newGatewayRoutesTestRouterWithConfig(&config.Config{
		Gateway: config.GatewayConfig{
			MaxBodySize:     1024 * 1024,
			TextMaxBodySize: 1024 * 1024,
		},
	}, platform...)
}

func newGatewayRoutesTestRouterWithConfig(cfg *config.Config, platform ...string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()

	groupPlatform := service.PlatformOpenAI
	if len(platform) > 0 && platform[0] != "" {
		groupPlatform = platform[0]
	}
	RegisterGatewayRoutes(
		router,
		&handler.Handlers{
			Gateway:       &handler.GatewayHandler{},
			OpenAIGateway: &handler.OpenAIGatewayHandler{},
			AsyncImage:    handler.NewAsyncImageHandler(nil, nil),
		},
		servermiddleware.APIKeyAuthMiddleware(func(c *gin.Context) {
			groupID := int64(1)
			c.Set(string(servermiddleware.ContextKeyAPIKey), &service.APIKey{
				GroupID: &groupID,
				Group:   &service.Group{Platform: groupPlatform},
			})
			c.Next()
		}),
		nil,
		nil,
		nil,
		nil,
		nil,
		cfg,
	)

	return router
}

func TestGatewayRoutesOpenAIResponsesCompactPathIsRegistered(t *testing.T) {
	router := newGatewayRoutesTestRouter()

	for _, path := range []string{
		"/v1/responses/compact",
		"/responses/compact",
		"/backend-api/codex/responses",
		"/backend-api/codex/responses/compact",
	} {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"model":"gpt-5"}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)
		require.NotEqual(t, http.StatusNotFound, w.Code, "path=%s should hit OpenAI responses handler", path)
	}
}

func TestGatewayRoutesOpenAIAlphaSearchPathsAreRegistered(t *testing.T) {
	router := newGatewayRoutesTestRouter()
	registered := make(map[string]bool)
	for _, route := range router.Routes() {
		if route.Method == http.MethodPost {
			registered[route.Path] = true
		}
	}

	for _, path := range []string{
		"/v1/alpha/search",
		"/alpha/search",
		"/backend-api/codex/alpha/search",
	} {
		require.True(t, registered[path], "POST %s should be registered", path)
	}
}

func TestGatewayRoutesAlphaSearchRejectsUnsupportedGroup(t *testing.T) {
	router := newGatewayRoutesTestRouter(service.PlatformGrok)
	req := httptest.NewRequest(http.MethodPost, "/v1/alpha/search", strings.NewReader(`{"model":"gpt-5.6-sol"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusNotFound, w.Code)
	require.Contains(t, w.Body.String(), "only available for OpenAI and Composite groups")
}

func TestGatewayRoutesOpenAIImagesPathsAreRegistered(t *testing.T) {
	router := newGatewayRoutesTestRouter()

	for _, path := range []string{
		"/v1/images/generations",
		"/v1/images/edits",
		"/images/generations",
		"/images/edits",
	} {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"model":"gpt-image-2","prompt":"draw a cat"}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)
		require.NotEqual(t, http.StatusNotFound, w.Code, "path=%s should hit OpenAI images handler", path)
	}
}

var novelAICompatRoutes = []struct {
	method string
	path   string
	body   string
}{
	{http.MethodGet, "/user/subscription", ""},
	{http.MethodGet, "/ai/generate-image/suggest-tags", ""},
	{http.MethodPost, "/ai/upscale", `{"model":"bogus-probe","image":"image"}`},
	{http.MethodPost, "/ai/augment-image", `{"req_type":"bg-removal","image":"image"}`},
}

type novelAIRouteAPIKeyRepo struct {
	keyBillingRouteAPIKeyRepo
}

func (*novelAIRouteAPIKeyRepo) UpdateLastUsed(context.Context, int64, time.Time) error {
	return nil
}

func newNovelAICompatRouteTestRouter(t *testing.T, platform string) (*gin.Engine, *service.APIKey) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	group := &service.Group{ID: 42, Status: service.StatusActive, Hydrated: true, Platform: platform}
	user := &service.User{ID: 7, Role: service.RoleUser, Status: service.StatusActive, Balance: 10}
	key := &service.APIKey{ID: 100, UserID: user.ID, Key: "sk-novelai-route-test", Status: service.StatusActive,
		User: user, GroupID: &group.ID, Group: group}
	cfg := &config.Config{RunMode: config.RunModeStandard,
		Gateway: config.GatewayConfig{MaxBodySize: 1024 * 1024, TextMaxBodySize: 1024 * 1024}}
	keys := service.NewAPIKeyService(&novelAIRouteAPIKeyRepo{keyBillingRouteAPIKeyRepo{apiKey: key}}, nil, nil, nil, nil, nil, cfg)
	router := gin.New()
	RegisterGatewayRoutes(router,
		&handler.Handlers{Gateway: &handler.GatewayHandler{}, OpenAIGateway: &handler.OpenAIGatewayHandler{}},
		servermiddleware.NewAPIKeyAuthMiddleware(keys, nil, cfg), keys, nil, nil, nil, nil, cfg)
	return router, key
}

type novelAIRouteGroupRepo struct {
	service.GroupRepository
	groups map[int64]*service.Group
}

func (r *novelAIRouteGroupRepo) GetByIDLite(_ context.Context, id int64) (*service.Group, error) {
	if group := r.groups[id]; group != nil {
		return group, nil
	}
	return nil, service.ErrGroupNotFound
}

type novelAIRouteAccounts struct {
	service.AccountRepository
	groups map[int64][]service.Account
}

func (r *novelAIRouteAccounts) ListSchedulableByGroupIDAndPlatform(_ context.Context, id int64, platform string) ([]service.Account, error) {
	var accounts []service.Account
	for _, account := range r.groups[id] {
		if account.Platform == platform {
			accounts = append(accounts, account)
		}
	}
	return accounts, nil
}

type novelAIRouteGroupProbe struct {
	gateway *service.GatewayService
	groups  []int64
	models  []string
	kinds   []string
}

func (p *novelAIRouteGroupProbe) ProbeAPIKeyGroup(ctx context.Context, group *service.Group, model, kind string) (service.APIKeyGroupAvailability, error) {
	p.groups = append(p.groups, group.ID)
	p.models = append(p.models, model)
	p.kinds = append(p.kinds, kind)
	return p.gateway.ProbeAPIKeyGroup(ctx, group, model, kind)
}

func TestGatewayRoutesNovelAINativeUtilityMultiGroupCapabilitySelection(t *testing.T) {
	for _, platform := range []string{service.PlatformNovelAI, service.PlatformComposite} {
		for _, prefix := range []string{"/v1", ""} {
			for _, tc := range []struct{ path, body string }{
				{"/ai/augment-image", `{"req_type":"bg-removal","image":"image"}`},
				{"/ai/upscale", `{"model":"gpt-4o","image":"image"}`},
				{"/ai/encode-vibe", `{"model":"gpt-4o","image":"image"}`},
			} {
				t.Run(platform+prefix+tc.path, func(t *testing.T) {
					groups := &novelAIRouteGroupRepo{groups: map[int64]*service.Group{
						1: {ID: 1, Platform: service.PlatformOpenAI, Status: service.StatusActive, Hydrated: true, RateMultiplier: 0.01, AllowImageGeneration: true},
						2: {ID: 2, Platform: platform, Status: service.StatusActive, Hydrated: true, RateMultiplier: 1, AllowImageGeneration: true},
					}}
					accounts := &novelAIRouteAccounts{groups: map[int64][]service.Account{2: {{
						ID: 20, Platform: service.PlatformNovelAI, Type: service.AccountTypeAPIKey, Status: service.StatusActive, Schedulable: true,
						Credentials: map[string]any{"model_mapping": map[string]any{"nai-diffusion-5-curated": "nai-diffusion-5-curated"}},
					}}}}
					key := &service.APIKey{ID: 100, UserID: 7, Key: "sk-novelai-multigroup-test", Status: service.StatusActive,
						GroupID: &groups.groups[1].ID, GroupIDs: []int64{1, 2}, Group: groups.groups[1],
						User: &service.User{ID: 7, Role: service.RoleUser, Status: service.StatusActive, Balance: 10}}
					cfg := &config.Config{RunMode: config.RunModeStandard,
						Gateway: config.GatewayConfig{MaxBodySize: 1024 * 1024, TextMaxBodySize: 1024 * 1024}}
					keys := service.NewAPIKeyService(&novelAIRouteAPIKeyRepo{keyBillingRouteAPIKeyRepo{apiKey: key}}, nil, groups, nil, nil, nil, cfg)
					gateway := service.NewGatewayService(accounts, groups, nil, nil, nil, nil, nil, nil, cfg, nil, nil, nil, nil, nil,
						nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil)
					probe := &novelAIRouteGroupProbe{gateway: gateway}
					keys.SetGroupRouter(probe)
					router := gin.New()
					var selectedGroup int64
					router.Use(func(c *gin.Context) {
						c.Next()
						if selected, ok := servermiddleware.GetAPIKeyFromContext(c); ok {
							selectedGroup = *selected.GroupID
						}
					})
					RegisterGatewayRoutes(router, &handler.Handlers{Gateway: &handler.GatewayHandler{}, OpenAIGateway: &handler.OpenAIGatewayHandler{}},
						servermiddleware.NewAPIKeyAuthMiddleware(keys, nil, cfg), keys, nil, nil, nil, nil, cfg)
					req := httptest.NewRequest(http.MethodPost, prefix+tc.path, strings.NewReader(tc.body))
					req.Header.Set("Content-Type", "application/json")
					req.Header.Set("Authorization", "Bearer "+key.Key)
					w := httptest.NewRecorder()
					router.ServeHTTP(w, req)
					require.Equal(t, http.StatusServiceUnavailable, w.Code, w.Body.String())
					require.Contains(t, w.Body.String(), "Service temporarily unavailable", "must reach native handler's dependency guard")
					require.Equal(t, int64(2), selectedGroup, "must not pick the cheaper incompatible group")
					require.Equal(t, []int64{2}, probe.groups)
					require.Equal(t, []string{""}, probe.models, "capacity probe must not use client model catalog")
					require.Equal(t, []string{"image"}, probe.kinds)
				})
			}
		}
	}
}

func TestGatewayRoutesNovelAINativeUtilityCompositeMalformedModelReachesHandler(t *testing.T) {
	router, key := newNovelAICompatRouteTestRouter(t, service.PlatformComposite)
	for _, prefix := range []string{"/v1", ""} {
		for _, path := range []string{"/ai/upscale", "/ai/augment-image", "/ai/encode-vibe", "/ai/generate-image", "/ai/generate-image-stream"} {
			req := httptest.NewRequest(http.MethodPost, prefix+path, strings.NewReader(`{"model":"gpt-4o","image":"image","req_type":"colorize"}`))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+key.Key)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			if strings.HasPrefix(path, "/ai/generate-image") {
				require.Equal(t, http.StatusNotFound, w.Code, "generation must retain model-based platform dispatch")
				require.Contains(t, w.Body.String(), "NovelAI endpoints are not supported for this platform")
			} else {
				require.Equal(t, http.StatusServiceUnavailable, w.Code, w.Body.String())
				require.Contains(t, w.Body.String(), "Service temporarily unavailable", "must reach native handler's dependency guard")
			}
		}
	}
}

func TestGatewayRoutesNovelAICompatAliasesAreRegistered(t *testing.T) {
	router := newGatewayRoutesTestRouter(service.PlatformNovelAI)
	registered := make(map[string]bool)
	for _, route := range router.Routes() {
		registered[route.Method+" "+route.Path] = true
	}
	for _, prefix := range []string{"/v1", ""} {
		for _, route := range novelAICompatRoutes {
			require.True(t, registered[route.method+" "+prefix+route.path], "%s %s%s", route.method, prefix, route.path)
		}
		require.False(t, registered["POST "+prefix+"/ai/annotate-image"], "annotate-image must remain unsupported")
	}
}

func TestGatewayRoutesNovelAICompatRequireAPIKey(t *testing.T) {
	for _, platform := range []string{service.PlatformNovelAI, service.PlatformComposite} {
		t.Run(platform, func(t *testing.T) {
			router, _ := newNovelAICompatRouteTestRouter(t, platform)
			for _, prefix := range []string{"/v1", ""} {
				for _, route := range novelAICompatRoutes {
					for _, credential := range []string{"", "sk-invalid-route-test"} {
						req := httptest.NewRequest(route.method, prefix+route.path, strings.NewReader(route.body))
						req.Header.Set("Content-Type", "application/json")
						if credential != "" {
							req.Header.Set("Authorization", "Bearer "+credential)
						}
						w := httptest.NewRecorder()
						router.ServeHTTP(w, req)
						require.Equal(t, http.StatusUnauthorized, w.Code, "%s %s%s: %s", route.method, prefix, route.path, w.Body.String())
						require.Contains(t, w.Header().Get("Content-Type"), "application/json")
					}
				}
			}
		})
	}
}

func TestGatewayRoutesNovelAICompatDispatchAndPlatformGate(t *testing.T) {
	for _, platform := range []string{service.PlatformNovelAI, service.PlatformComposite, service.PlatformOpenAI, service.PlatformGrok} {
		t.Run(platform, func(t *testing.T) {
			router, key := newNovelAICompatRouteTestRouter(t, platform)
			for _, prefix := range []string{"/v1", ""} {
				for _, route := range novelAICompatRoutes {
					req := httptest.NewRequest(route.method, prefix+route.path, strings.NewReader(route.body))
					req.Header.Set("Content-Type", "application/json")
					req.Header.Set("Authorization", "Bearer "+key.Key)
					w := httptest.NewRecorder()
					router.ServeHTTP(w, req)
					if platform != service.PlatformNovelAI && platform != service.PlatformComposite {
						require.Equal(t, http.StatusNotFound, w.Code, route.path)
						require.Contains(t, w.Body.String(), "NovelAI endpoints are not supported for this platform")
						continue
					}
					require.Contains(t, w.Header().Get("Content-Type"), "application/json")
					switch route.path {
					case "/user/subscription":
						require.Equal(t, http.StatusOK, w.Code, prefix+route.path)
						require.JSONEq(t, `{"tier":3,"active":true,"expiresAt":4102444800,"trainingStepsLeft":{"fixedTrainingStepsLeft":10000,"purchasedTrainingSteps":0},"usage":{"percent":100,"purchasedPercent":0,"isNegative":false,"timeUntilNextPercent":60}}`, w.Body.String())
					case "/ai/generate-image/suggest-tags":
						// No gateway service is injected: this exact error proves the GET
						// method reached its own handler, not NovelAI's POST parser.
						require.Equal(t, http.StatusServiceUnavailable, w.Code, w.Body.String())
						require.Contains(t, w.Body.String(), "Gateway service unavailable")
					default:
						require.Equal(t, http.StatusServiceUnavailable, w.Code, w.Body.String())
						require.Contains(t, w.Body.String(), "Service temporarily unavailable")
					}
				}
			}
		})
	}
}

func TestGatewayRoutesNovelAIMetadataAllowsZeroBalance(t *testing.T) {
	for _, platform := range []string{service.PlatformNovelAI, service.PlatformComposite} {
		t.Run(platform, func(t *testing.T) {
			router, key := newNovelAICompatRouteTestRouter(t, platform)
			key.User.Balance = 0
			for _, prefix := range []string{"/v1", ""} {
				for _, route := range novelAICompatRoutes {
					if route.method != http.MethodGet {
						continue
					}
					req := httptest.NewRequest(route.method, prefix+route.path+"?prompt=1girl%2C", nil)
					req.Header.Set("Authorization", "Bearer "+key.Key)
					w := httptest.NewRecorder()
					router.ServeHTTP(w, req)
					if route.path == "/user/subscription" {
						require.Equal(t, http.StatusOK, w.Code, w.Body.String())
					} else {
						require.Equal(t, http.StatusServiceUnavailable, w.Code, w.Body.String())
						require.Contains(t, w.Body.String(), "Gateway service unavailable")
					}
					require.NotContains(t, w.Body.String(), "INSUFFICIENT_BALANCE")
				}
			}
		})
	}
}

func TestGatewayRoutesNovelAICompatMultipartReachesNativeHandler(t *testing.T) {
	for _, platform := range []string{service.PlatformNovelAI, service.PlatformComposite} {
		t.Run(platform, func(t *testing.T) {
			router, key := newNovelAICompatRouteTestRouter(t, platform)
			for _, prefix := range []string{"/v1", ""} {
				for _, route := range novelAICompatRoutes {
					if route.method != http.MethodPost {
						continue
					}
					var body bytes.Buffer
					writer := multipart.NewWriter(&body)
					require.NoError(t, writer.WriteField("request", route.body))
					image, err := writer.CreateFormFile("image", "test.png")
					require.NoError(t, err)
					_, err = image.Write([]byte("test-image-bytes"))
					require.NoError(t, err)
					require.NoError(t, writer.Close())
					req := httptest.NewRequest(route.method, prefix+route.path, bytes.NewReader(body.Bytes()))
					req.Header.Set("Content-Type", writer.FormDataContentType())
					req.Header.Set("Authorization", "Bearer "+key.Key)
					w := httptest.NewRecorder()
					router.ServeHTTP(w, req)
					require.Equal(t, http.StatusServiceUnavailable, w.Code, w.Body.String())
					require.Contains(t, w.Body.String(), "Service temporarily unavailable")
				}
			}
		})
	}
}

func TestGatewayRoutesNovelAICompatRetainsExplicitModelAllowlist(t *testing.T) {
	for _, platform := range []string{service.PlatformNovelAI, service.PlatformComposite} {
		t.Run(platform, func(t *testing.T) {
			router := newGatewayRoutesTestRouterWithGroup(allowlistGroup(platform, true, "nai-diffusion-5-curated"))
			for _, prefix := range []string{"/v1", ""} {
				for _, tc := range []struct{ method, path, body string }{
					{http.MethodGet, "/ai/generate-image/suggest-tags?model=blocked-model", ""},
					{http.MethodPost, "/ai/upscale", `{"model":"blocked-model","image":"image"}`},
					{http.MethodPost, "/ai/augment-image", `{"model":"blocked-model","req_type":"colorize","image":"image"}`},
				} {
					req := httptest.NewRequest(tc.method, prefix+tc.path, strings.NewReader(tc.body))
					req.Header.Set("Content-Type", "application/json")
					w := httptest.NewRecorder()
					router.ServeHTTP(w, req)
					require.Equal(t, http.StatusNotFound, w.Code)
					require.Contains(t, w.Body.String(), "is not available for this group")
				}
			}
		})
	}
}

func TestGatewayRoutesAsyncImagesPathsAreRegistered(t *testing.T) {
	router := newGatewayRoutesTestRouter()
	registered := make(map[string]bool)
	for _, route := range router.Routes() {
		registered[route.Method+" "+route.Path] = true
	}

	for _, route := range []string{
		"POST /v1/images/generations/async",
		"POST /v1/images/edits/async",
		"GET /v1/images/tasks/:task_id",
		"POST /images/generations/async",
		"POST /images/edits/async",
		"GET /images/tasks/:task_id",
	} {
		require.True(t, registered[route], "%s should be registered", route)
	}
}

func TestGatewayRoutesGrokImagesAndVideosPathsAreRegistered(t *testing.T) {
	router := newGatewayRoutesTestRouter(service.PlatformGrok)

	for _, path := range []string{
		"/v1/images/generations",
		"/v1/images/edits",
		"/images/generations",
		"/images/edits",
		"/v1/videos/generations",
		"/v1/videos",
		"/videos",
		"/videos/generations",
		"/v1/videos/edits",
		"/videos/edits",
		"/v1/videos/extensions",
		"/videos/extensions",
	} {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"model":"grok-imagine","prompt":"draw a cat"}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)
		require.NotEqual(t, http.StatusNotFound, w.Code, "path=%s should hit Grok media handler", path)
		require.NotContains(t, w.Body.String(), "not supported for this platform")
	}

	for _, path := range []string{
		"/v1/videos/request-123",
		"/videos/request-123",
		"/v1/videos/generations/request-123",
		"/videos/generations/request-123",
		"/v1/videos/edits/request-123",
		"/videos/edits/request-123",
		"/v1/videos/extensions/request-123",
		"/videos/extensions/request-123",
		"/v1/videos/request-123/content",
		"/videos/request-123/content",
		"/v1/videos/generations/request-123/content",
		"/videos/generations/request-123/content",
		"/v1/videos/edits/request-123/content",
		"/videos/edits/request-123/content",
		"/v1/videos/extensions/request-123/content",
		"/videos/extensions/request-123/content",
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)
		require.NotEqual(t, http.StatusNotFound, w.Code, "path=%s should hit Grok video handler", path)
		require.NotContains(t, w.Body.String(), "not supported for this platform")
	}
}

func TestGatewayRoutesGrokCustomVoiceCRUDPathsAreRegistered(t *testing.T) {
	router := newGatewayRoutesTestRouter(service.PlatformGrok)
	registered := make(map[string]bool)
	for _, route := range router.Routes() {
		registered[route.Method+" "+route.Path] = true
	}
	for _, route := range []string{
		"POST /v1/custom-voices",
		"GET /v1/custom-voices",
		"GET /v1/custom-voices/:voice_id",
		"PATCH /v1/custom-voices/:voice_id",
		"DELETE /v1/custom-voices/:voice_id",
		"GET /v1/custom-voices/:voice_id/audio",
		"POST /custom-voices",
		"GET /custom-voices",
		"GET /custom-voices/:voice_id",
		"PATCH /custom-voices/:voice_id",
		"DELETE /custom-voices/:voice_id",
		"GET /custom-voices/:voice_id/audio",
	} {
		require.True(t, registered[route], "%s should be registered", route)
	}
}

func TestGrokCustomVoiceEndpointUsesRouteTemplateNotRawPath(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	var got string
	capture := func(c *gin.Context) {
		got = grokCustomVoiceEndpoint(c)
		c.Status(http.StatusOK)
	}
	router.GET("/v1/custom-voices/:voice_id/audio", capture)
	router.GET("/v1/custom-voices/:voice_id", capture)

	for _, tc := range []struct {
		path string
		want string
	}{
		{path: "/v1/custom-voices/voice-123", want: "custom-voices/voice-123"},
		{path: "/v1/custom-voices/voice-123/audio", want: "custom-voices/voice-123/audio"},
		// A voice literally named "audio" matches /:voice_id, not /:voice_id/audio.
		// A raw-path suffix check would turn this profile lookup into an audio download.
		{path: "/v1/custom-voices/audio", want: "custom-voices/audio"},
		{path: "/v1/custom-voices/audio/audio", want: "custom-voices/audio/audio"},
	} {
		got = ""
		req := httptest.NewRequest(http.MethodGet, tc.path, nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)
		require.Equal(t, http.StatusOK, w.Code, "path=%s", tc.path)
		require.Equal(t, tc.want, got, "path=%s", tc.path)
	}
}

func TestGatewayRoutesCompositeVideoLookupsUseGrokHandler(t *testing.T) {
	router := newGatewayRoutesTestRouter(service.PlatformComposite)

	for _, path := range []string{
		"/v1/videos/request-123",
		"/videos/request-123",
		"/v1/videos/request-123/content",
		"/videos/request-123/content",
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)
		require.NotEqual(t, http.StatusNotFound, w.Code, "path=%s should hit Grok video lookup handler", path)
		require.NotContains(t, w.Body.String(), "not supported for this platform")
	}
}

func TestGatewayRoutesCompositeMessagesWithGrokModelUsesOpenAIGateway(t *testing.T) {
	router := newGatewayRoutesTestRouter(service.PlatformComposite)

	req := httptest.NewRequest(http.MethodPost, "/v1/messages", strings.NewReader(`{"model":"grok-4.3","messages":[{"role":"user","content":"hi"}]}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	require.NotEqual(t, http.StatusNotFound, w.Code)
	require.NotContains(t, w.Body.String(), "not supported")
	require.NotContains(t, w.Body.String(), "OpenAI-compatible endpoint")
	require.NotContains(t, w.Body.String(), "composite groups")
}

func TestGatewayRoutesCompositeChatCompletionsWithGrokModelUsesOpenAIGateway(t *testing.T) {
	router := newGatewayRoutesTestRouter(service.PlatformComposite)

	for _, path := range []string{"/v1/chat/completions", "/chat/completions"} {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"model":"grok-4.3","messages":[{"role":"user","content":"hi"}]}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		require.NotEqual(t, http.StatusNotFound, w.Code, "path=%s", path)
		require.NotContains(t, w.Body.String(), "not supported")
		require.NotContains(t, w.Body.String(), "OpenAI-compatible endpoint")
		require.NotContains(t, w.Body.String(), "composite groups")
	}
}

func TestGatewayRoutesNonGrokVideosAreRejectedAtPlatformGate(t *testing.T) {
	router := newGatewayRoutesTestRouter(service.PlatformOpenAI)

	for _, tc := range []struct {
		method string
		path   string
		body   string
	}{
		{http.MethodPost, "/v1/videos/generations", `{"model":"grok-imagine-video-1.5","prompt":"waves"}`},
		{http.MethodPost, "/v1/videos", `{"model":"grok-imagine-video-1.5","prompt":"waves"}`},
		{http.MethodPost, "/videos", `{"model":"grok-imagine-video-1.5","prompt":"waves"}`},
		{http.MethodPost, "/videos/generations", `{"model":"grok-imagine-video-1.5","prompt":"waves"}`},
		{http.MethodPost, "/v1/videos/edits", `{"model":"grok-imagine-video","prompt":"waves","video":{"url":"https://example.com/in.mp4"}}`},
		{http.MethodPost, "/videos/edits", `{"model":"grok-imagine-video","prompt":"waves","video":{"url":"https://example.com/in.mp4"}}`},
		{http.MethodPost, "/v1/videos/extensions", `{"model":"grok-imagine-video","prompt":"waves","video":{"url":"https://example.com/in.mp4"}}`},
		{http.MethodPost, "/videos/extensions", `{"model":"grok-imagine-video","prompt":"waves","video":{"url":"https://example.com/in.mp4"}}`},
		{http.MethodGet, "/v1/videos/request-123", ""},
		{http.MethodGet, "/videos/request-123", ""},
		{http.MethodGet, "/v1/videos/generations/request-123", ""},
		{http.MethodGet, "/videos/generations/request-123", ""},
		{http.MethodGet, "/v1/videos/edits/request-123", ""},
		{http.MethodGet, "/videos/edits/request-123", ""},
		{http.MethodGet, "/v1/videos/extensions/request-123", ""},
		{http.MethodGet, "/videos/extensions/request-123", ""},
		{http.MethodGet, "/v1/videos/request-123/content", ""},
		{http.MethodGet, "/videos/request-123/content", ""},
		{http.MethodGet, "/v1/videos/generations/request-123/content", ""},
		{http.MethodGet, "/videos/generations/request-123/content", ""},
		{http.MethodGet, "/v1/videos/edits/request-123/content", ""},
		{http.MethodGet, "/videos/edits/request-123/content", ""},
		{http.MethodGet, "/v1/videos/extensions/request-123/content", ""},
		{http.MethodGet, "/videos/extensions/request-123/content", ""},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)
		require.Equal(t, http.StatusNotFound, w.Code, "method=%s path=%s", tc.method, tc.path)
		require.Contains(t, w.Body.String(), "Videos API is not supported for this platform")
	}
}

func TestGatewayRoutesCompositeVideoGenerationAllowed(t *testing.T) {
	router := newGatewayRoutesTestRouter(service.PlatformComposite)

	req := httptest.NewRequest(http.MethodPost, "/v1/videos/generations", strings.NewReader(`{"model":"grok-imagine-video-1.5","prompt":"waves"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)
	require.NotEqual(t, http.StatusNotFound, w.Code)
	require.NotContains(t, w.Body.String(), "not supported")
}

func TestGatewayRoutesCompositeOpenAIOnlyEndpointsRequireOpenAITarget(t *testing.T) {
	router := newGatewayRoutesTestRouter(service.PlatformComposite)

	req := httptest.NewRequest(http.MethodPost, "/v1/embeddings", strings.NewReader(`{"model":"gemini-2.5-pro","input":"hello"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusNotFound, w.Code)

	req = httptest.NewRequest(http.MethodPost, "/v1/embeddings", strings.NewReader(`{"model":"text-embedding-3-small","input":"hello"}`))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()

	router.ServeHTTP(w, req)
	require.NotEqual(t, http.StatusNotFound, w.Code)
}

func TestGatewayRoutesGrokAllowsCLICompatibilityEntrypoints(t *testing.T) {
	router := newGatewayRoutesTestRouter(service.PlatformGrok)

	for _, tc := range []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/v1/messages"},
		{http.MethodPost, "/v1/chat/completions"},
		{http.MethodPost, "/chat/completions"},
		{http.MethodGet, "/v1/responses"},
		{http.MethodGet, "/responses"},
		{http.MethodGet, "/backend-api/codex/responses"},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(`{"model":"grok"}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)
		require.NotEqual(t, http.StatusNotFound, w.Code, "method=%s path=%s", tc.method, tc.path)
		require.NotContains(t, w.Body.String(), "not supported for Grok groups")
	}

	countTokensRouter := newGatewayRoutesTestRouterWithConfig(&config.Config{
		Gateway: config.GatewayConfig{MaxBodySize: 1024 * 1024},
	}, service.PlatformGrok)
	for _, path := range []string{"/v1/messages/count_tokens", "/messages/count_tokens"} {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"model":"grok","messages":[{"role":"user","content":"hi"}]}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		countTokensRouter.ServeHTTP(w, req)
		require.Equal(t, http.StatusOK, w.Code, "path=%s", path)
		var response struct {
			InputTokens int `json:"input_tokens"`
		}
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response), "path=%s", path)
		require.Positive(t, response.InputTokens, "path=%s", path)
	}

	for _, path := range []string{
		"/v1/responses",
		"/responses",
		"/backend-api/codex/responses",
	} {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"model":"grok","input":"hi"}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)
		require.NotEqual(t, http.StatusNotFound, w.Code, "path=%s should still reach Responses handler", path)
	}
}

// TestGatewayRoutesResponsesSubpathRejectsNonConformingSubpaths 端到端锁定不变式：
// /responses/*subpath 的子路径会被转发到上游同名端点之后，因此不合规的子路径必须
// 在入口就被拒绝，不得进入调度与转发流程。
func TestGatewayRoutesResponsesSubpathRejectsNonConformingSubpaths(t *testing.T) {
	router := newGatewayRoutesTestRouter()

	for _, path := range []string{
		"/v1/responses/../../x/y",
		"/v1/responses/..%2f..%2fx/y",
		"/v1/responses/%2e%2e/%2e%2e/x",
		"/responses/%2e%2e%2fx",
		"/backend-api/codex/responses/..%2f..%2fx",
		`/v1/responses/..\..\x`,
		"/v1/responses/%3fa=b",
		"/v1/responses/x%23frag",
		"/v1/responses/compact%2f..",
	} {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"model":"gpt-5"}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)
		require.Equal(t, http.StatusNotFound, w.Code, "path=%s must be rejected at the edge", path)
		require.Contains(t, w.Body.String(), "Unsupported responses subpath", "path=%s", path)
	}
}

func TestGatewayRoutesOpenAICountTokensPathIsRegistered(t *testing.T) {
	router := newGatewayRoutesTestRouter(service.PlatformOpenAI)

	req := httptest.NewRequest(http.MethodPost, "/v1/messages/count_tokens", strings.NewReader(`{"model":"claude-sonnet-4-5","messages":[{"role":"user","content":"hi"}]}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)
	require.NotEqual(t, http.StatusNotFound, w.Code)
}
