//go:build embed

package web

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/Wei-Shaw/sub2api/internal/handler"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/server/routes"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// The NovelAI native image endpoints sit at the root, where NovelAI clients call them; the embedded frontend
// must not answer them with index.html.
func TestEmbeddedFrontendBypassesNovelAINativeRoutes(t *testing.T) {
	for _, prefix := range []string{"/v1", ""} {
		for _, path := range []string{"/user/subscription", "/ai/generate-image", "/ai/generate-image-stream", "/ai/encode-vibe", "/ai/upscale", "/ai/augment-image", "/ai/generate-image/suggest-tags"} {
			require.True(t, shouldBypassEmbeddedFrontend(prefix+path), "path=%s%s", prefix, path)
		}
	}
	for _, path := range []string{"/user", "/user/profile", "/user/subscription/other", "/user/subscription-other", "/unknown-client-page"} {
		require.False(t, shouldBypassEmbeddedFrontend(path), "only the exact subscription alias should bypass: %s", path)
	}
}

type novelAIEmbeddedAPIKeyRepo struct {
	service.APIKeyRepository
	key *service.APIKey
}

func (r *novelAIEmbeddedAPIKeyRepo) GetByKeyForAuth(_ context.Context, key string) (*service.APIKey, error) {
	if key != r.key.Key {
		return nil, service.ErrAPIKeyNotFound
	}
	clone := *r.key
	return &clone, nil
}

func TestEmbeddedFrontendNovelAISubscriptionRegisteredRoute(t *testing.T) {
	for _, implementation := range []string{"settings_middleware", "legacy_middleware"} {
		t.Run(implementation, func(t *testing.T) {
			provider := &mockSettingsProvider{settings: map[string]string{"site_name": "NovelAI Test"}}
			frontend, err := NewFrontendServer(provider)
			require.NoError(t, err)
			frontendMiddleware := frontend.Middleware()
			if implementation == "legacy_middleware" {
				frontendMiddleware = ServeEmbeddedFrontend()
			}
			group := &service.Group{ID: 42, Platform: service.PlatformNovelAI, Status: service.StatusActive, Hydrated: true}
			user := &service.User{ID: 7, Role: service.RoleUser, Status: service.StatusActive, Balance: 0}
			key := &service.APIKey{ID: 100, UserID: user.ID, Key: "sk-embedded-novelai-test", Status: service.StatusActive,
				User: user, GroupID: &group.ID, Group: group}
			cfg := &config.Config{RunMode: config.RunModeStandard,
				Gateway: config.GatewayConfig{MaxBodySize: 1024 * 1024, TextMaxBodySize: 1024 * 1024}}
			keys := service.NewAPIKeyService(&novelAIEmbeddedAPIKeyRepo{key: key}, nil, nil, nil, nil, nil, cfg)
			router := gin.New()
			router.Use(frontendMiddleware)
			routes.RegisterGatewayRoutes(router,
				&handler.Handlers{Gateway: &handler.GatewayHandler{}, OpenAIGateway: &handler.OpenAIGatewayHandler{}},
				middleware.NewAPIKeyAuthMiddleware(keys, nil, cfg), keys, nil, nil, nil, nil, cfg)

			for _, prefix := range []string{"/v1", ""} {
				for _, credential := range []string{"", "sk-invalid-embedded-test", key.Key} {
					req := httptest.NewRequest(http.MethodGet, prefix+"/user/subscription", nil)
					if credential != "" {
						req.Header.Set("Authorization", "Bearer "+credential)
					}
					w := httptest.NewRecorder()
					router.ServeHTTP(w, req)
					require.Contains(t, w.Header().Get("Content-Type"), "application/json")
					require.NotContains(t, w.Body.String(), "<!doctype html>")
					if credential == key.Key {
						require.Equal(t, http.StatusOK, w.Code, w.Body.String())
						require.JSONEq(t, `{"tier":3,"active":true,"expiresAt":4102444800,"trainingStepsLeft":{"fixedTrainingStepsLeft":10000,"purchasedTrainingSteps":0},"usage":{"percent":100,"purchasedPercent":0,"isNegative":false,"timeUntilNextPercent":60}}`, w.Body.String())
					} else {
						require.Equal(t, http.StatusUnauthorized, w.Code, w.Body.String())
					}
				}
			}
			require.Zero(t, provider.called, "API requests must never render SPA settings")

			for _, path := range []string{"/unknown-client-page", "/user/profile", "/user/subscription/other", "/user/subscription-other"} {
				w := httptest.NewRecorder()
				router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
				require.Equal(t, http.StatusOK, w.Code, path)
				require.Contains(t, w.Header().Get("Content-Type"), "text/html", path)
				require.Contains(t, w.Body.String(), "<!doctype html>", path)
			}
		})
	}
}
