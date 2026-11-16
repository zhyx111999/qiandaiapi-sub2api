package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// NovelAI image operations relayed to an operator-configured NovelAI gateway (nai-station): the
// OpenAI-compatible Images endpoints and the NovelAI native ones. Chat Completions go through the
// stock raw Chat Completions path like any provider. Requests and responses are relayed verbatim;
// parsing only reads what billing and the prompt audit need (model, image count, size, reference
// images, prompt text).

type NovelAIOperation string

const (
	NovelAIImagesGeneration    NovelAIOperation = "images-generation"
	NovelAIImagesEdit          NovelAIOperation = "images-edit"
	NovelAIGenerateImage       NovelAIOperation = "generate-image"
	NovelAIGenerateImageStream NovelAIOperation = "generate-image-stream"
	NovelAIEncodeVibe          NovelAIOperation = "encode-vibe"
	NovelAIUpscale             NovelAIOperation = "upscale"
	NovelAIAugmentImage        NovelAIOperation = "augment-image"
	NovelAISuggestTags         NovelAIOperation = "suggest-tags"
)

// NovelAIRequest is what a NovelAI image request asks for, as far as billing is concerned.
type NovelAIRequest struct {
	Operation NovelAIOperation
	Endpoint  string // upstream path
	Model     string
	// RequestedModel is the original parsed model, before a model-less augment
	// receives a synthetic log label. An explicitly supplied label stays here.
	RequestedModel string
	Body           []byte
	ContentType    string
	Stream         bool
	// NativeCostUSD is the endpoint tariff in USD, before rate multipliers.
	// nil keeps generation pricing; nonnil zero is an explicitly free utility.
	// An unknown augment type carries a reservation only, never a settlement.
	NativeCostUSD *float64
	// NativeRateMultiplier is resolved once when reserving the selected
	// account's charge. Successful forwarding copies it for stable settlement.
	NativeRateMultiplier *float64
	// ReqType and Defry are read only for Director tools; the body stays intact.
	ReqType string
	Defry   *int
	// Samples is the number of generated images (0 for native utilities and tags).
	Samples int
	// Width and Height of the largest requested image (0 when not given).
	Width, Height int64
	// ReferenceImages counts the vibe / character references sent with a native generation.
	ReferenceImages int
	// Prompt is the positive prompt text (Images prompt; native input, v4 base and character
	// captions), audited like an OpenAI Images prompt.
	Prompt string
}

// IsNativeUtility distinguishes per-call tools from generation and free tag lookup.
func (r *NovelAIRequest) IsNativeUtility() bool {
	return r != nil && (r.Operation == NovelAIEncodeVibe || r.Operation == NovelAIUpscale || r.Operation == NovelAIAugmentImage)
}

// SchedulingModel keeps utility validation upstream. An invalid tool model must
// receive the upstream 400, not fail the generation-model scheduler. The actual
// request model (or a synthetic model-less operation label) remains in logs only.
func (r *NovelAIRequest) SchedulingModel() string {
	if r == nil || r.IsNativeUtility() || r.Operation == NovelAISuggestTags {
		return ""
	}
	return r.Model
}

// ModerationBody is the prompt audit payload, in the OpenAI Images shape; nil without a prompt.
func (r *NovelAIRequest) ModerationBody() []byte {
	if r == nil || r.Prompt == "" {
		return nil
	}
	body, _ := json.Marshal(map[string]string{"prompt": r.Prompt})
	return body
}

// BillingTier is the stock image tier of the request (by total pixels), "" when the size is unknown.
func (r *NovelAIRequest) BillingTier() string {
	return NovelAIImageBillingTier(r.Width, r.Height)
}

var novelAIOperations = map[string]NovelAIOperation{
	"/images/generations":             NovelAIImagesGeneration,
	"/images/edits":                   NovelAIImagesEdit,
	"/ai/generate-image":              NovelAIGenerateImage,
	"/ai/generate-image-stream":       NovelAIGenerateImageStream,
	"/ai/encode-vibe":                 NovelAIEncodeVibe,
	"/ai/upscale":                     NovelAIUpscale,
	"/ai/augment-image":               NovelAIAugmentImage,
	"/ai/generate-image/suggest-tags": NovelAISuggestTags,
}

// NovelAIOperationForPath maps an inbound path (with or without /v1) to its operation and upstream path.
func NovelAIOperationForPath(path string) (NovelAIOperation, string, bool) {
	path = strings.TrimPrefix(strings.TrimSpace(path), "/v1")
	op, ok := novelAIOperations[path]
	if !ok {
		return "", "", false
	}
	if op == NovelAIImagesGeneration || op == NovelAIImagesEdit {
		return op, "/v1" + path, true
	}
	return op, path, true
}

// ParseNovelAIRequest reads billing facts without rewriting the body. Generation
// requires a model; model-less Director tools get a log-only operation label.
// Director dimensions are validated because they determine the native quote.
func ParseNovelAIRequest(path, contentType string, body []byte) (*NovelAIRequest, error) {
	op, endpoint, ok := NovelAIOperationForPath(path)
	if !ok {
		return nil, errors.New("unsupported NovelAI endpoint")
	}
	req := &NovelAIRequest{Operation: op, Endpoint: endpoint, Body: body, ContentType: contentType}
	if op == NovelAISuggestTags {
		// GET query parameters are not parsed/re-encoded: ForwardNovelAI copies
		// the inbound RawQuery, including repeated keys and original escaping.
		return req, nil
	}
	fields, multipartRequest, err := novelAIFields(contentType, body)
	if err != nil {
		return nil, err
	}
	if raw, supplied := fields["model"]; supplied {
		if err := json.Unmarshal(raw, &req.Model); err != nil {
			return nil, errors.New("model must be a string")
		}
	}
	req.Model = strings.TrimSpace(req.Model)
	req.RequestedModel = req.Model
	if req.Model == "" {
		if op != NovelAIAugmentImage {
			return nil, errors.New("model is required")
		}
		// This is an operation label for usage logs, not an advertised model or
		// an upstream rewrite. Capability selection uses SchedulingModel().
		req.Model = "novelai/augment-image"
	}

	switch op {
	case NovelAIImagesGeneration, NovelAIImagesEdit:
		req.Stream = novelAIJSONTrue(fields["stream"])
		req.Samples = novelAICount(fields["n"])
		req.Width, req.Height = novelAISize(fields)
		req.Prompt = novelAIPrompt(fields["prompt"])
	case NovelAIGenerateImage, NovelAIGenerateImageStream:
		req.Stream = op == NovelAIGenerateImageStream
		params := novelAIJSONObject(fields["parameters"])
		req.Samples = novelAICount(params["n_samples"])
		req.Width, req.Height = novelAIJSONInt(params["width"]), novelAIJSONInt(params["height"])
		req.ReferenceImages = novelAIReferenceCount(params, multipartRequest)
		caption := novelAIJSONObject(novelAIJSONObject(params["v4_prompt"])["caption"])
		var characters []map[string]json.RawMessage
		_ = json.Unmarshal(caption["char_captions"], &characters)
		texts := []json.RawMessage{fields["input"], caption["base_caption"]}
		for _, character := range characters {
			texts = append(texts, character["char_caption"])
		}
		req.Prompt = novelAIPrompt(texts...)
	case NovelAIEncodeVibe, NovelAIUpscale:
		// Fixed per-call tariffs; generation fields (including dimensions and
		// reference images) are irrelevant and must not affect their prices.
	case NovelAIAugmentImage:
		if err := json.Unmarshal(fields["req_type"], &req.ReqType); err != nil || req.ReqType == "" {
			return nil, errors.New("augment req_type is required")
		}
		if req.Width, err = novelAIAugmentDimension(fields["width"], "width"); err != nil {
			return nil, err
		}
		if req.Height, err = novelAIAugmentDimension(fields["height"], "height"); err != nil {
			return nil, err
		}
		if req.ReqType == "emotion" || req.ReqType == "colorize" {
			if raw, supplied := fields["defry"]; supplied {
				var defry int
				if err := json.Unmarshal(raw, &defry); err != nil || string(bytes.TrimSpace(raw)) == "null" || defry < 0 || defry > 5 {
					return nil, errors.New("augment defry must be an integer from 0 to 5")
				}
				req.Defry = &defry
			}
		}
		req.Prompt = novelAIPrompt(fields["prompt"])
	}
	if err := quoteNovelAINativeRequest(req); err != nil {
		return nil, err
	}
	return req, nil
}

// novelAIFields returns the request's top-level JSON fields. Native multipart carries its JSON
// object in a "request" part; Images edits use plain form fields.
func novelAIFields(contentType string, body []byte) (map[string]json.RawMessage, bool, error) {
	mediaType, params, _ := mime.ParseMediaType(contentType)
	if !strings.EqualFold(mediaType, "multipart/form-data") {
		fields := novelAIJSONObject(body)
		if fields == nil {
			return nil, false, errors.New("request body must be a JSON object")
		}
		return fields, false, nil
	}
	if params["boundary"] == "" {
		return nil, false, errors.New("multipart boundary is required")
	}
	reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
	fields := make(map[string]json.RawMessage)
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, false, errors.New("invalid multipart body")
		}
		name := part.FormName()
		if part.FileName() != "" && name != "request" {
			_ = part.Close()
			continue
		}
		value, err := io.ReadAll(part)
		_ = part.Close()
		if err != nil {
			return nil, false, errors.New("invalid multipart body")
		}
		switch name {
		case "request":
			if native := novelAIJSONObject(value); native != nil {
				return native, true, nil
			}
			return nil, false, errors.New("multipart request part must be a JSON object")
		case "model", "size", "prompt":
			fields[name], _ = json.Marshal(strings.TrimSpace(string(value)))
		case "n", "stream", "width", "height":
			fields[name] = json.RawMessage(bytes.TrimSpace(value))
		}
	}
	return fields, false, nil
}

// novelAIReferenceCount counts a native generation's references: vibe references
// (reference_image / reference_image_multiple, the larger list) plus character references
// (director_reference_images and its cached form; a multipart request sends both lists, a JSON
// request repeats the same references in either).
func novelAIReferenceCount(params map[string]json.RawMessage, multipartRequest bool) int {
	vibe := max(novelAIReferenceEntries(params["reference_image"]), novelAIReferenceEntries(params["reference_image_multiple"]))
	inline, cached := novelAIReferenceEntries(params["director_reference_images"]), novelAIReferenceEntries(params["director_reference_images_cached"])
	character := max(inline, cached)
	if multipartRequest {
		character = inline + cached
	}
	return vibe + character
}

// novelAIReferenceEntries counts the non-empty references in a value: a string, or an object carrying an
// image / cache_id / data, or a list of those.
func novelAIReferenceEntries(raw json.RawMessage) int {
	var list []json.RawMessage
	if json.Unmarshal(raw, &list) == nil {
		count := 0
		for _, item := range list {
			count += novelAIReferenceEntries(item)
		}
		return count
	}
	var text string
	if json.Unmarshal(raw, &text) == nil {
		if novelAIReferenceAsset(text) {
			return 1
		}
		return 0
	}
	object := novelAIJSONObject(raw)
	for _, key := range []string{"image", "cache_id", "data"} {
		if json.Unmarshal(object[key], &text) == nil && novelAIReferenceAsset(text) {
			return 1
		}
	}
	return 0
}

func novelAIReferenceAsset(value string) bool {
	value = strings.TrimSpace(value)
	if strings.HasPrefix(strings.ToLower(value), "data:") {
		comma := strings.IndexByte(value, ',')
		return comma >= 0 && strings.TrimSpace(value[comma+1:]) != ""
	}
	return value != ""
}

// novelAIPrompt joins the distinct non-empty prompt strings.
func novelAIPrompt(values ...json.RawMessage) string {
	seen := make(map[string]struct{}, len(values))
	parts := make([]string, 0, len(values))
	for _, raw := range values {
		var text string
		if json.Unmarshal(raw, &text) != nil {
			continue
		}
		text = strings.TrimSpace(text)
		if _, ok := seen[text]; ok || text == "" {
			continue
		}
		seen[text] = struct{}{}
		parts = append(parts, text)
	}
	return strings.Join(parts, "\n")
}

// novelAISize reads an Images request's size ("WxH") or width/height.
func novelAISize(fields map[string]json.RawMessage) (int64, int64) {
	var size string
	if json.Unmarshal(fields["size"], &size) == nil {
		if w, h, ok := strings.Cut(strings.ToLower(strings.TrimSpace(size)), "x"); ok {
			width, _ := strconv.ParseInt(strings.TrimSpace(w), 10, 64)
			height, _ := strconv.ParseInt(strings.TrimSpace(h), 10, 64)
			return width, height
		}
	}
	return novelAIJSONInt(fields["width"]), novelAIJSONInt(fields["height"])
}

func novelAIJSONObject(raw []byte) map[string]json.RawMessage {
	var object map[string]json.RawMessage
	if json.Unmarshal(raw, &object) != nil {
		var text string
		if json.Unmarshal(raw, &text) != nil || json.Unmarshal([]byte(text), &object) != nil {
			return nil
		}
	}
	return object
}

func novelAIJSONInt(raw json.RawMessage) int64 {
	var value float64
	if json.Unmarshal(raw, &value) != nil || value <= 0 {
		return 0
	}
	return int64(value)
}

func novelAIJSONTrue(raw json.RawMessage) bool {
	return strings.TrimSpace(string(raw)) == "true"
}

func novelAICount(raw json.RawMessage) int {
	if count := novelAIJSONInt(raw); count > 0 {
		return int(count)
	}
	return 1
}

// ForwardNovelAI relays a NovelAI request verbatim. Generation retains the stock
// failover/partial-result paths. Native utilities and free tag lookup are single
// attempts: errors preserve upstream status/body/content type with no billable
// result, and only a fully relayed utility success carries its endpoint quote.
func (s *OpenAIGatewayService) ForwardNovelAI(ctx context.Context, c *gin.Context, account *Account, req *NovelAIRequest) (*OpenAIForwardResult, error) {
	if account == nil || account.Platform != PlatformNovelAI {
		return nil, errors.New("NovelAI requests need a NovelAI account")
	}
	if req == nil {
		return nil, errors.New("NovelAI request is required")
	}
	var nativeQuote, nativeRate float64
	if req.IsNativeUtility() {
		if req.NativeCostUSD == nil {
			return nil, errors.New("NovelAI native utility has no endpoint quote")
		}
		var err error
		if nativeRate, err = novelAINativeRateSnapshot(req.NativeRateMultiplier); err != nil {
			return nil, err
		}
		nativeQuote = *req.NativeCostUSD
		if _, err := calculateNovelAINativeCost(nativeQuote, nativeRate); err != nil {
			return nil, err
		}
	}
	start := time.Now()
	singleAttempt := req.IsNativeUtility() || req.Operation == NovelAISuggestTags
	if singleAttempt {
		// A redirect can replay a charged POST (307/308), or turn a utility
		// failure into an unrelated login-page 200 (302). Return the original
		// response without another HTTP request; generation behavior is unchanged.
		ctx = WithHTTPUpstreamRedirectsDisabled(ctx)
	}
	method := http.MethodPost
	if req.Operation == NovelAISuggestTags {
		method = http.MethodGet
		// The handler starts this budget before account selection. Also bound
		// direct service callers, without extending an earlier caller deadline.
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
	}
	baseURL, err := s.validateUpstreamBaseURL(account.GetOpenAIBaseURL())
	if err != nil {
		return nil, err
	}
	target := buildOpenAIEndpointURL(baseURL, req.Endpoint)
	if c.Request.URL.RawQuery != "" {
		target += "?" + c.Request.URL.RawQuery
	}
	var body io.Reader
	if method == http.MethodPost {
		body = bytes.NewReader(req.Body)
	}
	upstreamReq, err := http.NewRequestWithContext(ctx, method, target, body)
	if err != nil {
		return nil, fmt.Errorf("build NovelAI request: %w", err)
	}
	if req.ContentType != "" {
		upstreamReq.Header.Set("Content-Type", req.ContentType)
	}
	if accept := c.GetHeader("Accept"); accept != "" {
		upstreamReq.Header.Set("Accept", accept)
	}
	upstreamReq.Header.Set("Authorization", "Bearer "+account.GetCNAPIKey())

	proxyURL := ""
	if account.ProxyID != nil && account.Proxy != nil {
		proxyURL = account.Proxy.URL()
	}
	SetOpsUpstreamModel(c, req.Model)
	SetActualOpenAIUpstreamEndpoint(c, req.Endpoint)
	upstreamStart := time.Now()
	resp, err := s.httpUpstream.Do(upstreamReq, proxyURL, account.ID, account.Concurrency)
	SetOpsLatencyMs(c, OpsUpstreamLatencyMsKey, time.Since(upstreamStart).Milliseconds())
	if err != nil {
		safeErr := sanitizeUpstreamErrorMessage(err.Error())
		appendOpsUpstreamError(c, OpsUpstreamErrorEvent{
			ProxyID: opsUpstreamProxyID(account), ProxyName: opsUpstreamProxyName(account),
			Platform: account.Platform, AccountID: account.ID, AccountName: account.Name,
			UpstreamURL: safeUpstreamURL(target), Kind: "request_error", Message: safeErr,
		})
		return nil, fmt.Errorf("upstream request failed: %s", safeErr)
	}
	if singleAttempt && (resp.StatusCode < 200 || resp.StatusCode >= 300) {
		defer func() { _ = resp.Body.Close() }()
		appendOpsUpstreamError(c, OpsUpstreamErrorEvent{
			ProxyID: opsUpstreamProxyID(account), ProxyName: opsUpstreamProxyName(account),
			Platform: account.Platform, AccountID: account.ID, AccountName: account.Name,
			UpstreamStatusCode: resp.StatusCode, UpstreamRequestID: resp.Header.Get("x-request-id"),
			UpstreamURL: safeUpstreamURL(target), Kind: "http_error",
			Message: fmt.Sprintf("NovelAI native endpoint returned HTTP %d", resp.StatusCode),
		})
		// No JSON error translation, body truncation or failover: utilities can
		// spend Anlas even when an upstream attempt fails ambiguously.
		novelAICopyResponseHeaders(c, resp)
		c.Status(resp.StatusCode)
		c.Writer.WriteHeaderNow()
		if _, err := novelAICopyBody(c, resp.Body, start, false); err != nil {
			return nil, fmt.Errorf("upstream response failed: NovelAI HTTP %d body: %w", resp.StatusCode, err)
		}
		return nil, fmt.Errorf("upstream response failed: NovelAI HTTP %d", resp.StatusCode)
	}
	if resp.StatusCode >= 400 {
		return s.novelAIUpstreamError(ctx, c, account, req, resp, target)
	}
	defer func() { _ = resp.Body.Close() }()

	if req.IsNativeUtility() {
		if req.Operation == NovelAIAugmentImage {
			if _, err := novelAIAugmentAnlas(req.ReqType, req.Width, req.Height); err != nil {
				// Unknown types only receive a conservative admission quote. Never
				// release unexpectedly successful output as free or invent a bill.
				return nil, fmt.Errorf("cannot settle successful NovelAI utility: %w", err)
			}
		}
	}
	novelAICopyResponseHeaders(c, resp)
	c.Status(resp.StatusCode)
	firstTokenMs, copyErr := novelAICopyBody(c, resp.Body, start, req.Stream)
	if singleAttempt && copyErr != nil {
		return nil, fmt.Errorf("upstream response failed: relay NovelAI native response: %w", copyErr)
	}

	result := &OpenAIForwardResult{
		RequestID: resp.Header.Get("x-request-id"), Model: req.Model, UpstreamModel: req.Model, BillingModel: req.Model,
		UpstreamEndpoint: req.Endpoint, Stream: req.Stream, ResponseHeaders: resp.Header.Clone(),
		Duration: time.Since(start), FirstTokenMs: firstTokenMs,
	}
	if req.IsNativeUtility() {
		result.NovelAINativeCostUSD = &nativeQuote
		result.NovelAINativeRateMultiplier = &nativeRate
	} else if req.Operation != NovelAISuggestTags {
		result.ImageCount = req.Samples
		result.ImageSize = req.BillingTier()
		result.ReferenceImageCount = req.ReferenceImages
		// Pixels only: an output size would be re-tiered by the stock longest-edge rule
		// (ApplyOpenAIImageBillingResolution), overriding the NovelAI total-pixel tier.
		result.ImagePixels = req.Width * req.Height
	}
	return result, copyErr
}

func novelAICopyResponseHeaders(c *gin.Context, resp *http.Response) {
	// An absent upstream Content-Type must stay absent rather than being
	// synthesized by net/http from the first body bytes.
	c.Writer.Header()["Content-Type"] = nil
	for _, header := range []string{"Content-Type", "Content-Disposition", "Cache-Control", "X-Request-Id", "Retry-After"} {
		if values, ok := resp.Header[http.CanonicalHeaderKey(header)]; ok {
			c.Writer.Header()[header] = append([]string(nil), values...)
		}
	}
}

func (s *OpenAIGatewayService) novelAIUpstreamError(ctx context.Context, c *gin.Context, account *Account, req *NovelAIRequest, resp *http.Response, target string) (*OpenAIForwardResult, error) {
	body := s.readUpstreamErrorBody(resp)
	_ = resp.Body.Close()
	resp.Body = io.NopCloser(bytes.NewReader(body))
	message := sanitizeUpstreamErrorMessage(strings.TrimSpace(extractUpstreamErrorMessage(body)))
	if s.shouldFailoverOpenAIUpstreamResponse(account, resp.StatusCode, message, body) {
		appendOpsUpstreamError(c, OpsUpstreamErrorEvent{
			ProxyID: opsUpstreamProxyID(account), ProxyName: opsUpstreamProxyName(account),
			Platform: account.Platform, AccountID: account.ID, AccountName: account.Name,
			UpstreamStatusCode: resp.StatusCode, UpstreamRequestID: resp.Header.Get("x-request-id"),
			UpstreamURL: safeUpstreamURL(target), Kind: "failover", Message: message,
		})
		disabled := s.handleFailoverSideEffects(ctx, resp, account, body, req.Model)
		return nil, &UpstreamFailoverError{
			StatusCode: resp.StatusCode, ResponseBody: body, ResponseHeaders: resp.Header.Clone(),
			RetryableOnSameAccount: !disabled && account.IsPoolMode() && account.IsPoolModeRetryableStatus(resp.StatusCode),
		}
	}
	return s.handleErrorResponse(ctx, resp, c, account, req.Body, req.Model)
}

// novelAICopyBody relays the upstream body, flushing as it goes for streams; it returns the time
// to the first byte of a stream.
func novelAICopyBody(c *gin.Context, body io.Reader, start time.Time, stream bool) (*int, error) {
	if !stream {
		_, err := io.Copy(c.Writer, body)
		return nil, err
	}
	var firstTokenMs *int
	buf := make([]byte, 32<<10)
	for {
		n, err := body.Read(buf)
		if n > 0 {
			if firstTokenMs == nil {
				ms := int(time.Since(start).Milliseconds())
				firstTokenMs = &ms
			}
			if _, writeErr := c.Writer.Write(buf[:n]); writeErr != nil {
				return firstTokenMs, writeErr
			}
			c.Writer.Flush()
		}
		if errors.Is(err, io.EOF) {
			return firstTokenMs, nil
		}
		if err != nil {
			return firstTokenMs, err
		}
	}
}
