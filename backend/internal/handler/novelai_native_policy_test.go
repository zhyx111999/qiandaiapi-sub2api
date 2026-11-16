//go:build unit

package handler

import (
	"io"
	"net/http"
	"strings"
	"testing"

	middleware2 "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/stretchr/testify/require"
)

func TestNovelAINativeModelPolicyAfterMultipartParsing(t *testing.T) {
	h := &OpenAIGatewayHandler{}
	for _, operation := range []service.NovelAIOperation{service.NovelAIUpscale, service.NovelAIEncodeVibe} {
		c, w := novelAINativeContext(http.MethodPost, "/ai/"+string(operation), "")
		key, _ := middleware2.GetAPIKeyFromContext(c)
		key.Group.ModelAllowlist = service.GroupModelAllowlist{Enabled: true, Models: []string{"nai-diffusion-4-5-full"}}
		req := &service.NovelAIRequest{Operation: operation, Model: "not-allowed"}
		require.False(t, h.allowNovelAINativeModel(c, key, req))
		require.Equal(t, http.StatusNotFound, w.Code)
		require.Contains(t, w.Body.String(), "not available for this group")

		c, _ = novelAINativeContext(http.MethodPost, "/ai/"+string(operation), "")
		req.Model = "nai-diffusion-4-5-full"
		require.True(t, h.allowNovelAINativeModel(c, key, req))
		require.Contains(t, service.APIKeyQueueRequestPermissionsFromContext(c.Request.Context()).Models, req.Model)
	}
}

func TestNovelAINativeModelPolicyUsesPublicAlias(t *testing.T) {
	h := &OpenAIGatewayHandler{}
	c, _ := novelAINativeContext(http.MethodPost, "/ai/upscale", "")
	key, _ := middleware2.GetAPIKeyFromContext(c)
	key.Group.ModelAllowlist = service.GroupModelAllowlist{Enabled: true, Models: []string{"public-alias"}}
	c.Request = c.Request.WithContext(service.WithCompositeRouteDecision(c.Request.Context(), service.CompositeRouteDecision{
		Matched: true, Source: service.CompositeRouteSourceExplicit, PublicModel: "public-alias",
		TargetPlatform: service.PlatformNovelAI, UpstreamModel: "nai-diffusion-5-full",
	}))
	require.True(t, h.allowNovelAINativeModel(c, key, &service.NovelAIRequest{Operation: service.NovelAIUpscale, Model: "nai-diffusion-5-full"}))
	require.Equal(t, []string{"public-alias"}, service.APIKeyQueueRequestPermissionsFromContext(c.Request.Context()).Models)
}

func TestNovelAINativeIgnoresCompositeAccountOwnershipForCapability(t *testing.T) {
	h, slots, upstream, usage := newNovelAINativeHandler(t)
	upstream.call = func(req *http.Request, _ int64) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusBadRequest, Header: http.Header{"Content-Type": {"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{"message":"model does not exist"}`))}, nil
	}
	c, w := novelAINativeContext(http.MethodPost, "/ai/upscale", `{"model":"gpt-4o","image":"test"}`)
	key, _ := middleware2.GetAPIKeyFromContext(c)
	key.Group.Platform = service.PlatformComposite
	c.Request = c.Request.WithContext(service.WithCompositeRouteDecision(c.Request.Context(), service.CompositeRouteDecision{
		Matched: true, Source: service.CompositeRouteSourceAccount, PublicModel: "gpt-4o",
		TargetPlatform: service.PlatformOpenAI, UpstreamModel: "gpt-4o",
	}))
	h.NovelAI(c)
	require.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())
	require.Equal(t, 1, upstream.calls)
	require.Zero(t, usage.calls)
	require.Equal(t, "gpt-4o", clientRequestedModel(c, ""))
	slots.assertReleased(t)
}

func TestNovelAIAugmentExplicitModelStillEnforcesPolicy(t *testing.T) {
	h := &OpenAIGatewayHandler{}
	for _, model := range []string{"", "not-allowed", "novelai/augment-image"} {
		c, w := novelAINativeContext(http.MethodPost, "/ai/augment-image", "")
		key, _ := middleware2.GetAPIKeyFromContext(c)
		key.Group.ModelAllowlist = service.GroupModelAllowlist{Enabled: true, Models: []string{"nai-diffusion-5-full"}}
		req := &service.NovelAIRequest{Operation: service.NovelAIAugmentImage, Model: "novelai/augment-image", RequestedModel: model}
		require.Equal(t, model == "", h.allowNovelAINativeModel(c, key, req))
		if model != "" {
			require.Equal(t, http.StatusNotFound, w.Code)
		}
	}
}
