package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestNovelAIOperationForPath(t *testing.T) {
	op, endpoint, ok := NovelAIOperationForPath("/v1/images/generations")
	require.True(t, ok)
	require.Equal(t, NovelAIImagesGeneration, op)
	require.Equal(t, "/v1/images/generations", endpoint)

	op, endpoint, ok = NovelAIOperationForPath("/ai/generate-image-stream")
	require.True(t, ok)
	require.Equal(t, NovelAIGenerateImageStream, op)
	require.Equal(t, "/ai/generate-image-stream", endpoint)

	_, endpoint, _ = NovelAIOperationForPath("/v1/ai/encode-vibe")
	require.Equal(t, "/ai/encode-vibe", endpoint)

	for path, want := range map[string]NovelAIOperation{
		"/ai/upscale": NovelAIUpscale, "/ai/augment-image": NovelAIAugmentImage,
		"/ai/generate-image/suggest-tags": NovelAISuggestTags,
	} {
		for _, prefix := range []string{"", "/v1"} {
			op, endpoint, ok = NovelAIOperationForPath(prefix + path)
			require.True(t, ok)
			require.Equal(t, want, op)
			require.Equal(t, path, endpoint)
		}
	}
	_, _, ok = NovelAIOperationForPath("/ai/annotate-image")
	require.False(t, ok, "the removed annotate endpoint must stay unsupported")

	_, _, ok = NovelAIOperationForPath("/v1/chat/completions")
	require.False(t, ok, "chat goes through the stock raw Chat Completions path")
}

func TestParseNovelAIImagesRequest(t *testing.T) {
	req, err := ParseNovelAIRequest("/v1/images/generations", "application/json",
		[]byte(`{"model":"nai-diffusion-4-5-full","prompt":"orca","size":"832x1216","n":2,"stream":true}`))
	require.NoError(t, err)
	require.Equal(t, "nai-diffusion-4-5-full", req.Model)
	require.Equal(t, 2, req.Samples)
	require.True(t, req.Stream)
	require.Equal(t, ImageBillingSize1K, req.BillingTier())
	require.Zero(t, req.ReferenceImages)
	require.Nil(t, req.NativeCostUSD, "generation retains its existing pricing")
	require.False(t, req.IsNativeUtility())
	require.Equal(t, req.Model, req.SchedulingModel())
	require.JSONEq(t, `{"prompt":"orca"}`, string(req.ModerationBody()))
}

func TestParseNovelAINativeJSONRequest(t *testing.T) {
	body := `{"input":"orca","model":"nai-diffusion-5-full","action":"generate","parameters":{
		"width":1536,"height":1024,"n_samples":1,
		"v4_prompt":{"caption":{"base_caption":"orca","char_captions":[{"char_caption":"girl, smile"},{"char_caption":" "}]}},
		"reference_image_multiple":["aGVsbG8=","aGVsbG8="],"reference_image":"aGVsbG8=",
		"director_reference_images":[{"image":"aGVsbG8="}],"director_reference_images_cached":[{"cache_id":"abc"}]}}`
	req, err := ParseNovelAIRequest("/ai/generate-image", "application/json", []byte(body))
	require.NoError(t, err)
	require.Equal(t, NovelAIGenerateImage, req.Operation)
	require.False(t, req.Stream)
	require.Equal(t, 1, req.Samples)
	require.Equal(t, ImageBillingSize2K, req.BillingTier())
	// Vibe: the larger of the two lists (2). Character: a JSON request repeats the same
	// references in either list, so the larger one (1).
	require.Equal(t, 3, req.ReferenceImages)
	require.Equal(t, "orca\ngirl, smile", req.Prompt, "distinct non-empty prompt texts")
}

func TestParseNovelAINativeMultipartRequest(t *testing.T) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	part, err := w.CreateFormFile("request", "request.json") // a JSON Blob with a filename
	require.NoError(t, err)
	_, _ = part.Write([]byte(`{"model":"nai-diffusion-4-5-full","parameters":{"width":832,"height":1216,"n_samples":4,
		"director_reference_images":[{"image":"part-1"}],"director_reference_images_cached":[{"data":"part-2"},{"data":"part-3"}]}}`))
	image, _ := w.CreateFormFile("image", "base.png")
	_, _ = image.Write([]byte("png bytes"))
	require.NoError(t, w.Close())

	req, err := ParseNovelAIRequest("/v1/ai/generate-image-stream", w.FormDataContentType(), buf.Bytes())
	require.NoError(t, err)
	require.Equal(t, "nai-diffusion-4-5-full", req.Model)
	require.True(t, req.Stream)
	require.Equal(t, 4, req.Samples)
	require.Equal(t, ImageBillingSize1K, req.BillingTier())
	require.Equal(t, 3, req.ReferenceImages, "multipart sends inline and cached character references in separate lists")
}

func TestParseNovelAIImagesEditMultipart(t *testing.T) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("model", "nai-diffusion-4-5-full-inpainting")
	_ = w.WriteField("size", "1024x1024")
	_ = w.WriteField("n", "1")
	image, _ := w.CreateFormFile("image", "base.png")
	_, _ = image.Write([]byte("png bytes"))
	require.NoError(t, w.Close())

	req, err := ParseNovelAIRequest("/images/edits", w.FormDataContentType(), buf.Bytes())
	require.NoError(t, err)
	require.Equal(t, NovelAIImagesEdit, req.Operation)
	require.Equal(t, "nai-diffusion-4-5-full-inpainting", req.Model)
	require.Equal(t, ImageBillingSize1K, req.BillingTier())
	require.Zero(t, req.ReferenceImages, "the base image of an edit is not a reference")
}

func TestParseNovelAIEncodeVibeAndErrors(t *testing.T) {
	req, err := ParseNovelAIRequest("/ai/encode-vibe", "application/json",
		[]byte(`{"model":"nai-diffusion-4-5-full","image":"aGVsbG8=","information_extracted":1}`))
	require.NoError(t, err)
	require.Equal(t, NovelAIEncodeVibe, req.Operation)
	require.Zero(t, req.ReferenceImages)
	require.Nil(t, req.ModerationBody())
	require.NotNil(t, req.NativeCostUSD)
	require.InDelta(t, 0.02, *req.NativeCostUSD, 1e-12)
	require.True(t, req.IsNativeUtility())
	require.Empty(t, req.SchedulingModel())

	_, err = ParseNovelAIRequest("/ai/generate-image", "application/json", []byte(`{"parameters":{}}`))
	require.Error(t, err, "the model is required")
	_, err = ParseNovelAIRequest("/ai/generate-image", "application/json", []byte(`[1,2]`))
	require.Error(t, err)
	_, err = ParseNovelAIRequest("/v1/models", "application/json", []byte(`{"model":"x"}`))
	require.Error(t, err)
}

func TestParseNovelAINativeUtilities(t *testing.T) {
	for _, tc := range []struct {
		name, path, body string
		cost             float64
	}{
		{"upscale invalid model still forwarded", "/ai/upscale", ` { "model": "bogus-probe", "width": "irrelevant", "defry": [] } `, 0.01},
		{"encode ignores director fields", "/ai/encode-vibe", `{"model":"nai-diffusion-5-full","req_type":17,"width":-1,"height":null,"defry":"bad"}`, 0.02},
		{"background removal", "/ai/augment-image", `{"req_type":"bg-removal","width":64,"height":64,"defry":"irrelevant"}`, 0.08},
		{"free active Opus tool", "/ai/augment-image", `{"req_type":"emotion","width":1024,"height":1024,"defry":5,"use_new_shared_trial":false}`, 0},
		{"paid active Opus tool", "/ai/augment-image", `{"req_type":"emotion","width":1088,"height":1024,"defry":0}`, 0.22},
		{"unknown type reservation", "/ai/augment-image", `{"req_type":"bogus-probe","width":8,"height":8,"defry":"unknown"}`, 0.08},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body := []byte(tc.body)
			req, err := ParseNovelAIRequest(tc.path, "application/json", body)
			require.NoError(t, err)
			require.Equal(t, body, req.Body)
			require.True(t, req.IsNativeUtility())
			require.Empty(t, req.SchedulingModel())
			require.NotNil(t, req.NativeCostUSD)
			require.InDelta(t, tc.cost, *req.NativeCostUSD, 1e-12)
			require.Zero(t, req.Samples)
			require.Zero(t, req.ReferenceImages)
			if req.Operation == NovelAIAugmentImage {
				require.Equal(t, "novelai/augment-image", req.Model)
			} else {
				require.Zero(t, req.Width)
				require.Empty(t, req.ReqType)
				require.Nil(t, req.Defry)
			}
		})
	}
	for _, raw := range []string{"0", "-1", "1.5", "1.00000000000000001", "8193", "9223372036854775807", "18446744073709551616", "1e309", `"512"`, "null", "true", "{}"} {
		for _, field := range []string{"width", "height"} {
			body := fmt.Sprintf(`{"req_type":"bg-removal","width":512,"height":512,%q:%s}`, field, raw)
			req, err := ParseNovelAIRequest("/ai/augment-image", "application/json", []byte(body))
			require.Error(t, err, "%s=%s", field, raw)
			require.Nil(t, req)
		}
	}
	for _, body := range []string{
		`{"width":512,"height":512}`, `{"req_type":"emotion","height":512}`,
		`{"req_type":"emotion","width":512}`, `{"req_type":"emotion","width":512,"height":512,"defry":6}`,
		`{"req_type":"colorize","width":512,"height":512,"defry":null}`,
		`{"req_type":"colorize","width":512,"height":512,"defry":0.5}`,
	} {
		req, err := ParseNovelAIRequest("/ai/augment-image", "application/json", []byte(body))
		require.Error(t, err, body)
		require.Nil(t, req)
	}
}

type novelAITestUpstream struct {
	HTTPUpstream
	do func(*http.Request) (*http.Response, error)
}

func (u novelAITestUpstream) Do(req *http.Request, _ string, _ int64, _ int) (*http.Response, error) {
	return u.do(req)
}

func novelAITestAccount() *Account {
	return &Account{
		ID: 27, Platform: PlatformNovelAI, Type: AccountTypeAPIKey, Concurrency: 1,
		Credentials: map[string]any{"base_url": "https://nai-pool.example.test", "api_key": "test-pool-key"},
	}
}

func novelAITestContext(method, target string) (*gin.Context, *httptest.ResponseRecorder) {
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(method, target, nil)
	return c, rec
}

func novelAITestMultipart(t *testing.T, requestJSON string) ([]byte, string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	require.NoError(t, writer.SetBoundary("novelai-test-byte-preserving-boundary"))
	image, err := writer.CreateFormFile("image", "original.png")
	require.NoError(t, err)
	_, err = image.Write([]byte{0x89, 'P', 'N', 'G', 0, '\r', '\n', 0xff})
	require.NoError(t, err)
	part, err := writer.CreateFormFile("request", "request.json")
	require.NoError(t, err)
	_, err = part.Write([]byte(requestJSON))
	require.NoError(t, err)
	require.NoError(t, writer.WriteField("unused", "left exactly as supplied"))
	require.NoError(t, writer.Close())
	return body.Bytes(), writer.FormDataContentType()
}

func TestParseNovelAIRequestedModelDistinguishesSyntheticLabel(t *testing.T) {
	for _, tc := range []struct{ extra, want string }{
		{"", ""}, {`,"model":"novelai/augment-image"`, "novelai/augment-image"},
		{`,"model":" nai-diffusion-5-full "`, "nai-diffusion-5-full"},
	} {
		req, err := ParseNovelAIRequest("/ai/augment-image", "application/json", []byte(`{"req_type":"sketch","width":1024,"height":1024`+tc.extra+`}`))
		require.NoError(t, err)
		require.Equal(t, tc.want, req.RequestedModel)
		if tc.want == "" {
			require.Equal(t, "novelai/augment-image", req.Model)
		}
	}
}

func TestForwardNovelAINativeRejectsInvalidRateBeforeUpstream(t *testing.T) {
	for _, rate := range []*float64{nil, f64p(-1), f64p(math.NaN()), f64p(math.Inf(1)), f64p(math.Inf(-1))} {
		req, err := ParseNovelAIRequest("/ai/upscale", "application/json", []byte(`{"model":"nai-diffusion-5-full"}`))
		require.NoError(t, err)
		req.NativeRateMultiplier = rate
		calls := 0
		svc := &OpenAIGatewayService{httpUpstream: novelAITestUpstream{do: func(*http.Request) (*http.Response, error) {
			calls++
			return nil, errors.New("must not send an unreserved utility")
		}}}
		c, rec := novelAITestContext(http.MethodPost, "/ai/upscale")
		result, err := svc.ForwardNovelAI(context.Background(), c, novelAITestAccount(), req)
		require.ErrorContains(t, err, "rate multiplier")
		require.Nil(t, result)
		require.Zero(t, calls)
		require.False(t, c.Writer.Written())
		require.Empty(t, rec.Body.String())
	}
}

func TestForwardNovelAIUtilitiesBytePreserving(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		operation, request string
		cost               float64
	}{
		{"upscale", " {\n \"model\": \"nai-diffusion-5-curated\", \"image\":\"image\", \"declared_blur_sigma\":0 }\n", 0.01},
		{"encode-vibe", `{"model":"nai-diffusion-4-5-full","image":"image","information_extracted":1}`, 0.02},
		{"augment-image", `{"req_type":"bg-removal","width":512,"height":512,"image":"image"}`, 0.20},
		{"augment-image", `{"req_type":"sketch","width":1024,"height":1024,"image":"image"}`, 0},
	} {
		for _, multipartBody := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/%v/%g", tc.operation, multipartBody, tc.cost), func(t *testing.T) {
				body, contentType := []byte(tc.request), "application/json; charset=utf-8"
				if multipartBody {
					body, contentType = novelAITestMultipart(t, tc.request)
				}
				path := "/ai/" + tc.operation
				req, err := ParseNovelAIRequest("/v1"+path, contentType, body)
				require.NoError(t, err)
				req.NativeRateMultiplier = f64p(0.4)
				c, rec := novelAITestContext(http.MethodPost, path)
				c.Request.Header.Set("Accept", "application/zip, application/octet-stream")
				responseBody := []byte{'P', 'K', 3, 4, 0, 0xff, '\r', '\n'}
				calls := 0
				svc := &OpenAIGatewayService{httpUpstream: novelAITestUpstream{do: func(upstream *http.Request) (*http.Response, error) {
					calls++
					require.True(t, HTTPUpstreamRedirectsDisabled(upstream.Context()))
					require.Equal(t, http.MethodPost, upstream.Method)
					require.Equal(t, path, upstream.URL.Path)
					require.Equal(t, contentType, upstream.Header.Get("Content-Type"))
					require.Equal(t, "Bearer test-pool-key", upstream.Header.Get("Authorization"))
					require.Equal(t, c.GetHeader("Accept"), upstream.Header.Get("Accept"))
					forwarded, err := io.ReadAll(upstream.Body)
					require.NoError(t, err)
					require.Equal(t, body, forwarded, "do not decode/rebuild JSON or multipart bodies")
					return &http.Response{StatusCode: 201, Header: http.Header{
						"Content-Type": {"application/x-novelai-binary"}, "X-Request-Id": {"native-success"},
						"Content-Disposition": {`attachment; filename="output.zip"`},
					}, Body: io.NopCloser(bytes.NewReader(responseBody))}, nil
				}}}
				result, err := svc.ForwardNovelAI(context.Background(), c, novelAITestAccount(), req)
				require.NoError(t, err)
				require.Equal(t, 1, calls)
				require.Equal(t, 201, rec.Code)
				require.Equal(t, "application/x-novelai-binary", rec.Header().Get("Content-Type"))
				require.Equal(t, responseBody, rec.Body.Bytes())
				require.NotNil(t, result)
				require.Equal(t, path, result.UpstreamEndpoint)
				require.Equal(t, req.Model, result.Model)
				require.NotNil(t, result.NovelAINativeCostUSD)
				require.InDelta(t, tc.cost, *result.NovelAINativeCostUSD, 1e-12)
				require.Zero(t, result.ImageCount)
				require.Zero(t, result.ReferenceImageCount)
				require.NotNil(t, result.NovelAINativeRateMultiplier)
				require.InDelta(t, 0.4, *result.NovelAINativeRateMultiplier, 1e-12)
				*req.NativeCostUSD = 99
				*req.NativeRateMultiplier = 99
				require.InDelta(t, tc.cost, *result.NovelAINativeCostUSD, 1e-12, "settlement owns its quote snapshot")
				require.InDelta(t, 0.4, *result.NovelAINativeRateMultiplier, 1e-12, "settlement owns its rate snapshot")
			})
		}
	}
}

func TestForwardNovelAINativeErrorsPreserveResponseWithoutFailover(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, operation := range []string{"upscale", "encode-vibe", "augment-image", "generate-image/suggest-tags"} {
		for _, status := range []int{302, 307, 308, 400, 401, 403, 429, 500, 503} {
			for _, contentType := range []string{"application/json; charset=utf-8", "text/plain", ""} {
				t.Run(fmt.Sprintf("%s/%d/%s", operation, status, contentType), func(t *testing.T) {
					path := "/ai/" + operation
					req, err := ParseNovelAIRequest(path, "application/json", []byte(`{"model":"bogus-probe","req_type":"bogus-probe","width":8,"height":8}`))
					require.NoError(t, err)
					req.NativeRateMultiplier = f64p(1)
					c, rec := novelAITestContext(http.MethodPost, path)
					body := []byte("{\"error\":\"upstream validation or dimension mismatch\"}\n\x00\xff")
					calls := 0
					svc := &OpenAIGatewayService{httpUpstream: novelAITestUpstream{do: func(upstream *http.Request) (*http.Response, error) {
						calls++
						require.True(t, HTTPUpstreamRedirectsDisabled(upstream.Context()))
						headers := http.Header{"Retry-After": {"3"}, "X-Request-Id": {"native-failure"}}
						if contentType != "" {
							headers.Set("Content-Type", contentType)
						}
						return &http.Response{StatusCode: status, Header: headers, Body: io.NopCloser(bytes.NewReader(body))}, nil
					}}}
					result, err := svc.ForwardNovelAI(context.Background(), c, novelAITestAccount(), req)
					require.Error(t, err)
					require.Nil(t, result, "errors never provide a result/quote to settle")
					var failover *UpstreamFailoverError
					require.False(t, errors.As(err, &failover), "native utilities must never automatically retry")
					require.Equal(t, 1, calls)
					require.Equal(t, status, rec.Code)
					require.Equal(t, contentType, rec.Result().Header.Get("Content-Type"))
					require.Equal(t, "3", rec.Header().Get("Retry-After"))
					require.Equal(t, body, rec.Body.Bytes())
				})
			}
		}
	}
}

func TestForwardNovelAIEmptyErrorBodyCommitsStatus(t *testing.T) {
	req, err := ParseNovelAIRequest("/ai/upscale", "application/json", []byte(`{"model":"bogus-probe"}`))
	require.NoError(t, err)
	req.NativeRateMultiplier = f64p(1)
	c, rec := novelAITestContext(http.MethodPost, "/ai/upscale")
	svc := &OpenAIGatewayService{httpUpstream: novelAITestUpstream{do: func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 500, Header: http.Header{"Content-Type": {"text/plain"}}, Body: http.NoBody}, nil
	}}}
	result, err := svc.ForwardNovelAI(context.Background(), c, novelAITestAccount(), req)
	require.Error(t, err)
	require.Nil(t, result)
	require.True(t, c.Writer.Written())
	require.Equal(t, 500, rec.Code)
	require.Empty(t, rec.Body.Bytes())
}

func TestForwardNovelAINativeErrorBodyNotTruncated(t *testing.T) {
	req, err := ParseNovelAIRequest("/ai/encode-vibe", "application/json", []byte(`{"model":"bogus-probe"}`))
	require.NoError(t, err)
	req.NativeRateMultiplier = f64p(1)
	body := bytes.Repeat([]byte("validation\x00\xff\n"), int(openAIUpstreamErrorBodyReadLimit)/12+1)
	require.Greater(t, len(body), int(openAIUpstreamErrorBodyReadLimit))
	c, rec := novelAITestContext(http.MethodPost, "/ai/encode-vibe")
	svc := &OpenAIGatewayService{httpUpstream: novelAITestUpstream{do: func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 400, Header: http.Header{"Content-Type": {"application/octet-stream"}}, Body: io.NopCloser(bytes.NewReader(body))}, nil
	}}}
	result, err := svc.ForwardNovelAI(context.Background(), c, novelAITestAccount(), req)
	require.Error(t, err)
	require.Nil(t, result)
	require.Equal(t, body, rec.Body.Bytes(), "native errors bypass stock bounded JSON error translation")
}

func TestForwardNovelAIUnknownAugmentSuccessFailsClosed(t *testing.T) {
	req, err := ParseNovelAIRequest("/ai/augment-image", "application/json", []byte(`{"req_type":"bogus-probe","width":8,"height":8}`))
	require.NoError(t, err)
	require.NotNil(t, req.NativeCostUSD)
	require.Positive(t, *req.NativeCostUSD, "unknown actions get a conservative reservation, not free admission")
	req.NativeRateMultiplier = f64p(1)
	c, rec := novelAITestContext(http.MethodPost, "/ai/augment-image")
	svc := &OpenAIGatewayService{httpUpstream: novelAITestUpstream{do: func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"application/zip"}}, Body: io.NopCloser(strings.NewReader("unexpected paid image"))}, nil
	}}}
	result, err := svc.ForwardNovelAI(context.Background(), c, novelAITestAccount(), req)
	require.ErrorIs(t, err, errNovelAIUnknownAugmentType)
	require.Nil(t, result)
	require.False(t, c.Writer.Written(), "reject before releasing any output")
	require.Empty(t, rec.Header().Get("Content-Type"))
	require.Empty(t, rec.Body.Bytes())
}

func TestForwardNovelAISuggestTagsQueryAndDeadline(t *testing.T) {
	for _, earlyDeadline := range []bool{false, true} {
		t.Run(fmt.Sprint(earlyDeadline), func(t *testing.T) {
			rawQuery := "prompt=1girl%2c+blue%20hair&model=nai-diffusion-4-5-full&type=animev5&prompt=extra%2Btag&empty=&encoded=%2f%2F"
			c, rec := novelAITestContext(http.MethodGet, "/v1/ai/generate-image/suggest-tags?"+rawQuery)
			req, err := ParseNovelAIRequest(c.Request.URL.Path, "", nil)
			require.NoError(t, err)
			require.Equal(t, NovelAISuggestTags, req.Operation)
			require.Empty(t, req.SchedulingModel())
			require.False(t, req.IsNativeUtility())
			ctx := context.Background()
			if earlyDeadline {
				var cancel context.CancelFunc
				ctx, cancel = context.WithTimeout(ctx, time.Second)
				defer cancel()
			}
			start := time.Now()
			svc := &OpenAIGatewayService{httpUpstream: novelAITestUpstream{do: func(upstream *http.Request) (*http.Response, error) {
				require.True(t, HTTPUpstreamRedirectsDisabled(upstream.Context()))
				require.Equal(t, http.MethodGet, upstream.Method)
				require.Equal(t, "/ai/generate-image/suggest-tags", upstream.URL.Path)
				require.Equal(t, rawQuery, upstream.URL.RawQuery)
				require.Nil(t, upstream.Body)
				deadline, ok := upstream.Context().Deadline()
				require.True(t, ok)
				require.LessOrEqual(t, deadline.Sub(start), 5*time.Second+100*time.Millisecond)
				if earlyDeadline {
					parentDeadline, _ := ctx.Deadline()
					require.Equal(t, parentDeadline, deadline)
				}
				return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"text/plain"}}, Body: io.NopCloser(strings.NewReader(`{"tags":[{"tag":"1girl"}]}`))}, nil
			}}}
			result, err := svc.ForwardNovelAI(ctx, c, novelAITestAccount(), req)
			require.NoError(t, err)
			require.NotNil(t, result)
			require.Nil(t, result.NovelAINativeCostUSD)
			require.Zero(t, result.ImageCount)
			require.Equal(t, "text/plain", rec.Header().Get("Content-Type"))
			require.Equal(t, `{"tags":[{"tag":"1girl"}]}`, rec.Body.String())
		})
	}
}

func TestForwardNovelAISuggestTagsCancellation(t *testing.T) {
	c, _ := novelAITestContext(http.MethodGet, "/ai/generate-image/suggest-tags?prompt=tag")
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	svc := &OpenAIGatewayService{httpUpstream: novelAITestUpstream{do: func(upstream *http.Request) (*http.Response, error) {
		<-upstream.Context().Done()
		return nil, upstream.Context().Err()
	}}}
	start := time.Now()
	result, err := svc.ForwardNovelAI(ctx, c, novelAITestAccount(), &NovelAIRequest{Operation: NovelAISuggestTags, Endpoint: "/ai/generate-image/suggest-tags"})
	require.Error(t, err)
	require.Nil(t, result)
	require.Less(t, time.Since(start), time.Second)
}

type novelAITestBrokenBody struct{}

func (novelAITestBrokenBody) Read([]byte) (int, error) { return 0, io.ErrUnexpectedEOF }

func TestForwardNovelAINativePartialResponseHasNoBillableResult(t *testing.T) {
	for _, op := range []string{"upscale", "encode-vibe", "augment-image"} {
		req, err := ParseNovelAIRequest("/ai/"+op, "application/json", []byte(`{"model":"nai-diffusion-5-full","req_type":"bg-removal","width":64,"height":64}`))
		require.NoError(t, err)
		req.NativeRateMultiplier = f64p(1)
		c, rec := novelAITestContext(http.MethodPost, "/ai/"+op)

		svc := &OpenAIGatewayService{httpUpstream: novelAITestUpstream{do: func(*http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"application/zip"}},
				Body: io.NopCloser(io.MultiReader(strings.NewReader("partial"), novelAITestBrokenBody{}))}, nil
		}}}
		result, err := svc.ForwardNovelAI(context.Background(), c, novelAITestAccount(), req)
		require.ErrorIs(t, err, io.ErrUnexpectedEOF)
		require.Nil(t, result, op)
		require.Equal(t, "partial", rec.Body.String())
	}
}

func TestForwardNovelAIGenerationStillUsesFailover(t *testing.T) {
	req, err := ParseNovelAIRequest("/ai/generate-image", "application/json", []byte(`{"model":"nai-diffusion-5-full","parameters":{"width":1024,"height":1024}}`))
	require.NoError(t, err)
	c, rec := novelAITestContext(http.MethodPost, "/ai/generate-image")
	body := []byte(`{"error":"temporarily unavailable"}`)
	svc := &OpenAIGatewayService{httpUpstream: novelAITestUpstream{do: func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 503, Header: http.Header{"Content-Type": {"application/json"}}, Body: io.NopCloser(bytes.NewReader(body))}, nil
	}}}
	result, err := svc.ForwardNovelAI(context.Background(), c, novelAITestAccount(), req)
	require.Nil(t, result)
	var failover *UpstreamFailoverError
	require.ErrorAs(t, err, &failover)
	require.Equal(t, 503, failover.StatusCode)
	require.Equal(t, body, failover.ResponseBody)
	require.False(t, c.Writer.Written(), "generation retry decisions remain owned by the handler")
	require.Empty(t, rec.Body.Bytes())
}

func TestForwardNovelAIGenerationStillHasImageAndReferenceResult(t *testing.T) {
	for _, op := range []string{"generate-image", "generate-image-stream"} {
		req, err := ParseNovelAIRequest("/ai/"+op, "application/json", []byte(`{"model":"nai-diffusion-5-full","parameters":{"width":1536,"height":1024,"n_samples":2,"reference_image_multiple":["a","b"]}}`))
		require.NoError(t, err)
		require.Nil(t, req.NativeCostUSD)
		c, rec := novelAITestContext(http.MethodPost, "/ai/"+op)
		svc := &OpenAIGatewayService{httpUpstream: novelAITestUpstream{do: func(upstream *http.Request) (*http.Response, error) {
			require.False(t, HTTPUpstreamRedirectsDisabled(upstream.Context()), "generation keeps its existing transport policy")
			forwarded, err := io.ReadAll(upstream.Body)
			require.NoError(t, err)
			require.Equal(t, req.Body, forwarded)
			return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"application/zip"}}, Body: io.NopCloser(strings.NewReader("generation"))}, nil
		}}}
		result, err := svc.ForwardNovelAI(context.Background(), c, novelAITestAccount(), req)
		require.NoError(t, err)
		require.Equal(t, "generation", rec.Body.String())
		require.Nil(t, result.NovelAINativeCostUSD)
		require.Equal(t, 2, result.ImageCount)
		require.Equal(t, 2, result.ReferenceImageCount)
		require.Equal(t, ImageBillingSize2K, result.ImageSize)
		require.Equal(t, int64(1536*1024), result.ImagePixels)
		require.Equal(t, op == "generate-image-stream", result.Stream)
		if result.Stream {
			require.NotNil(t, result.FirstTokenMs)
		}
	}
}
