package service

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func novelAITestHarness(t *testing.T) (*gin.Context, *httptest.ResponseRecorder, *httpUpstreamRecorder, *AccountTestService, *Account) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/admin/accounts/6/test", nil)
	upstream := &httpUpstreamRecorder{resp: &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(`{"created":1,"data":[{"b64_json":"aGVsbG8="}]}`)),
	}}
	account := &Account{ID: 6, Name: "novelai", Platform: PlatformNovelAI, Type: AccountTypeAPIKey, Credentials: map[string]any{
		"api_key": "nai-key", "base_url": "http://nai-station:8300/v1",
		"model_mapping": map[string]any{"nai-diffusion-4-5-full": "nai-diffusion-4-5-full", "nai-diffusion-5-full": "nai-diffusion-5-full"},
	}}
	// nai-station is an internal http address, allowed by the default config (allow_insecure_http).
	cfg := &config.Config{}
	cfg.Security.URLAllowlist.AllowInsecureHTTP = true
	return c, rec, upstream, &AccountTestService{httpUpstream: upstream, cfg: cfg}, account
}

// The NovelAI account test generates an image through Images and hands it to the test window as an image.
func TestNovelAIAccountTestGeneratesAnImage(t *testing.T) {
	c, rec, upstream, svc, account := novelAITestHarness(t)
	require.NoError(t, svc.testNovelAIImageConnection(c, account, "nai-diffusion-5-full", "1girl, orca"))
	require.Equal(t, "http://nai-station:8300/v1/images/generations", upstream.lastReq.URL.String())
	require.Equal(t, "Bearer nai-key", upstream.lastReq.Header.Get("Authorization"))
	var body map[string]any
	require.NoError(t, json.Unmarshal(upstream.lastBody, &body))
	require.Equal(t, "nai-diffusion-5-full", body["model"])
	require.Equal(t, "1girl, orca", body["prompt"])
	out := rec.Body.String()
	require.Contains(t, out, `"type":"image"`)
	require.Contains(t, out, "data:image/png;base64,aGVsbG8=")
	require.Contains(t, out, `"success":true`)
	require.NotContains(t, out, "chat/completions")
}

// Without a model or prompt it uses the platform's test model and the official image test prompt.
func TestNovelAIAccountTestDefaults(t *testing.T) {
	c, _, upstream, svc, account := novelAITestHarness(t)
	require.NoError(t, svc.testNovelAIImageConnection(c, account, "", " "))
	var body map[string]any
	require.NoError(t, json.Unmarshal(upstream.lastBody, &body))
	require.Equal(t, account.providerDefaultTestModel(), body["model"])
	require.Equal(t, defaultOpenAIImageTestPrompt, body["prompt"])
}
