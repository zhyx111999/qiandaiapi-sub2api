//go:build unit

package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func novelAIChatImageFixture(t *testing.T, width, height int) string {
	t.Helper()
	var out bytes.Buffer
	require.NoError(t, png.Encode(&out, image.NewGray(image.Rect(0, 0, width, height))))
	return "![image_0](data:image/png;base64," + base64.StdEncoding.EncodeToString(out.Bytes()) + ")"
}

func novelAIChatResponseFixture(t *testing.T, content string, stream bool) string {
	t.Helper()
	marshal := func(v any) string {
		data, err := json.Marshal(v)
		require.NoError(t, err)
		return string(data)
	}
	usage := map[string]int{"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3}
	if !stream {
		return marshal(map[string]any{"model": "nai-diffusion-5-full", "choices": []any{map[string]any{
			"index": 0, "message": map[string]string{"role": "assistant", "content": content}, "finish_reason": "stop",
		}}, "usage": usage})
	}
	// Split the Markdown/data URI as well as the image payload across frames.
	var out strings.Builder
	for _, part := range []string{content[:1], content[1:21], content[21 : len(content)/2], content[len(content)/2:]} {
		out.WriteString("data: " + marshal(map[string]any{"choices": []any{map[string]any{
			"index": 0, "delta": map[string]string{"content": part},
		}}}) + "\n\n")
	}
	out.WriteString("data: " + marshal(map[string]any{"choices": []any{map[string]any{
		"index": 0, "delta": map[string]string{}, "finish_reason": "stop",
	}}, "usage": usage}) + "\n\ndata: [DONE]\n\n")
	return out.String()
}

func TestNovelAIChatForwardAndSettle(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, stream := range []bool{false, true} {
		for _, tc := range []struct {
			name                          string
			width, height                 int
			ref, free, token, independent bool
			want                          float64
		}{
			{name: "v5_portrait_discount", width: 832, height: 1216, want: .025},
			{name: "actual_square_pixel_tier", width: 1216, height: 1216, want: .25},
			{name: "independent_image_rate", width: 832, height: 1216, independent: true, want: .05},
			{name: "reference_surcharge", width: 832, height: 1216, ref: true, want: .0625},
			{name: "explicit_free_tier", width: 832, height: 1216, free: true},
			{name: "explicit_token_card", width: 832, height: 1216, token: true, want: .0000165},
		} {
			t.Run(fmt.Sprintf("%s/stream=%t", tc.name, stream), func(t *testing.T) {
				usageRepo := &openAIRecordUsageLogRepoStub{inserted: true}
				userRepo := &openAIRecordUsageUserRepoStub{}
				svc := newOpenAIRecordUsageServiceForTest(usageRepo, userRepo, &openAIRecordUsageSubRepoStub{}, nil)
				svc.cfg = rawChatCompletionsTestConfig()
				model := "nai-diffusion-5-full"
				content := novelAIChatImageFixture(t, tc.width, tc.height)
				response := novelAIChatResponseFixture(t, content, stream)
				upstream := &httpUpstreamRecorder{resp: &http.Response{StatusCode: 200,
					Header: http.Header{"Content-Type": {"application/json"}}, Body: io.NopCloser(strings.NewReader(response))}}
				svc.httpUpstream = upstream
				account := novelAITestAccount()
				gid := int64(7)
				key := &APIKey{ID: 101, UserID: 201, User: &User{ID: 201}, GroupID: &gid, Group: &Group{
					ID: gid, Platform: PlatformNovelAI, RateMultiplier: .5,
					ImageRateIndependent: tc.independent, ImageRateMultiplier: 1,
				}}
				svc.resolver = newOpenAIImageChannelPricingResolverForTest(t, gid, model, .05)
				cache := svc.resolver.channelService.cache.Load().(*channelCache)
				card := cache.pricingByGroupModel[channelModelKey{groupID: gid, model: model}]
				card.Intervals = novelAITestLadder()
				if tc.free {
					*card.Intervals[0].PerRequestPrice = 0
				}
				if tc.token {
					svc.resolver = newOpenAITokenImageChannelPricingResolverForTest(t, gid, model)
				}
				payload := map[string]any{"prompt": "a landscape", "size": []int{1536, 2048}}
				if tc.ref {
					payload["character_references"] = []any{map[string]string{"image": "cmVm"}}
				}
				inner, err := json.Marshal(payload)
				require.NoError(t, err)
				body, err := json.Marshal(map[string]any{"model": model, "stream": stream, "messages": []any{
					map[string]any{"role": "user", "content": string(inner)},
				}})
				require.NoError(t, err)
				recorder := httptest.NewRecorder()
				c, _ := gin.CreateTestContext(recorder)
				c.Request = httptest.NewRequest("POST", "/v1/chat/completions", bytes.NewReader(body))
				result, err := svc.ForwardAsChatCompletions(context.Background(), c, account, body, "", "")
				require.NoError(t, err)
				require.NotNil(t, result)
				require.Equal(t, 1, result.ImageCount)
				require.Equal(t, int64(tc.width*tc.height), result.ImagePixels, "actual PNG size wins over requested size")
				require.Equal(t, NovelAIImageBillingTier(int64(tc.width), int64(tc.height)), result.ImageSize)
				require.Equal(t, 2, result.Usage.OutputTokens, "do not fabricate or reinterpret upstream tokens")
				require.Equal(t, gjson.GetBytes(body, "messages").Raw, gjson.GetBytes(upstream.lastBody, "messages").Raw)
				if stream {
					require.Contains(t, recorder.Body.String(), "data: [DONE]")
				} else {
					require.Equal(t, content, gjson.GetBytes(recorder.Body.Bytes(), "choices.0.message.content").String())
				}
				err = svc.RecordUsage(context.Background(), &OpenAIRecordUsageInput{
					Result: result, APIKey: key, User: key.User, Account: account, OriginalModel: model,
					InboundEndpoint: "/v1/chat/completions", UpstreamEndpoint: "/v1/chat/completions",
				})
				require.NoError(t, err)
				require.NotNil(t, usageRepo.lastLog)
				require.Equal(t, 1, usageRepo.lastLog.ImageCount)
				require.InDelta(t, tc.want, usageRepo.lastLog.ActualCost, 1e-12)
				require.InDelta(t, tc.want, userRepo.lastAmount, 1e-12)
				if tc.free {
					require.Zero(t, userRepo.deductCalls)
				} else {
					require.Equal(t, 1, userRepo.deductCalls)
				}
			})
		}
	}
}

func TestNovelAIChatOnlyCompletedImagesCount(t *testing.T) {
	content := novelAIChatImageFixture(t, 832, 1216)
	for _, tc := range []struct {
		name, content, platform string
		want                    int
	}{
		{"complete", content, PlatformNovelAI, 1},
		{"two_images", content + "\n" + content, PlatformNovelAI, 2},
		{"truncated", strings.TrimSuffix(content, ")"), PlatformNovelAI, 0},
		{"plain_text", "generation failed", PlatformNovelAI, 0},
		{"invalid_image", "![x](data:image/png;base64,bm90LXB uZw==)", PlatformNovelAI, 0},
		{"foreign_provider", content, PlatformOpenAI, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			observer := newNovelAIChatImages(&Account{Platform: tc.platform})
			observer.Observe(novelAIChatResponseFixture(t, tc.content, false))
			result := &OpenAIForwardResult{}
			observer.Apply(result)
			require.Equal(t, tc.want, result.ImageCount)
		})
	}
}

func TestNovelAIChatReferencesUseFinalUserPayload(t *testing.T) {
	for _, tc := range []struct {
		body string
		want int
	}{
		{`{"messages":[{"role":"user","content":"{\"character_references\":[{\"image\":\"cmVm\"}]}"}]}`, 1},
		{`{"messages":[{"role":"user","content":[{"type":"text","text":"{\"character_references\":[{\"image\":\"cmVm\"}]}"}]}]}`, 1},
		{`{"messages":[{"role":"user","content":"{\"character_references\":[{\"image\":\"old\"}]}"},{"role":"assistant","content":"image"},{"role":"user","content":"new prompt"}]}`, 0},
		{`{"messages":[{"role":"user","content":"{\"image\":\"base\",\"character_references\":[{\"image\":\" \"},{\"image\":\"data:image/png;base64,\"}]}"}]}`, 0},
	} {
		require.Equal(t, tc.want, novelAIChatReferenceCount([]byte(tc.body)))
	}
}
