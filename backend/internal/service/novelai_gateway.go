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
)

// NovelAIRequest is what a NovelAI image request asks for, as far as billing is concerned.
type NovelAIRequest struct {
	Operation   NovelAIOperation
	Endpoint    string // upstream path
	Model       string
	Body        []byte
	ContentType string
	Stream      bool
	// Samples is the number of images requested (0 for encode-vibe).
	Samples int
	// Width and Height of the largest requested image (0 when not given).
	Width, Height int64
	// ReferenceImages counts the vibe / character references sent with a native generation.
	ReferenceImages int
	// Prompt is the positive prompt text (Images prompt; native input, v4 base and character
	// captions), audited like an OpenAI Images prompt.
	Prompt string
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
	"/images/generations":       NovelAIImagesGeneration,
	"/images/edits":             NovelAIImagesEdit,
	"/ai/generate-image":        NovelAIGenerateImage,
	"/ai/generate-image-stream": NovelAIGenerateImageStream,
	"/ai/encode-vibe":           NovelAIEncodeVibe,
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

// ParseNovelAIRequest reads the billing facts of a NovelAI image request. Only the model is
// required; drawing parameters are the gateway's business and stay untouched.
func ParseNovelAIRequest(path, contentType string, body []byte) (*NovelAIRequest, error) {
	op, endpoint, ok := NovelAIOperationForPath(path)
	if !ok {
		return nil, errors.New("unsupported NovelAI endpoint")
	}
	req := &NovelAIRequest{Operation: op, Endpoint: endpoint, Body: body, ContentType: contentType}
	fields, multipartRequest, err := novelAIFields(contentType, body)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(fields["model"], &req.Model); err != nil || strings.TrimSpace(req.Model) == "" {
		return nil, errors.New("model is required")
	}
	req.Model = strings.TrimSpace(req.Model)

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
	case NovelAIEncodeVibe:
		// Encoding a vibe produces no image; it is not an image generation.
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

// ForwardNovelAI relays one NovelAI image request to the account's gateway. Upstream errors take
// the stock OpenAI paths (failover for retryable statuses, passthrough otherwise); a success is
// streamed back as it comes, and the result carries what the stock image billing needs.
func (s *OpenAIGatewayService) ForwardNovelAI(ctx context.Context, c *gin.Context, account *Account, req *NovelAIRequest) (*OpenAIForwardResult, error) {
	if account == nil || account.Platform != PlatformNovelAI {
		return nil, errors.New("NovelAI requests need a NovelAI account")
	}
	start := time.Now()
	baseURL, err := s.validateUpstreamBaseURL(account.GetOpenAIBaseURL())
	if err != nil {
		return nil, err
	}
	target := buildOpenAIEndpointURL(baseURL, req.Endpoint)
	if c.Request.URL.RawQuery != "" {
		target += "?" + c.Request.URL.RawQuery
	}
	upstreamReq, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(req.Body))
	if err != nil {
		return nil, fmt.Errorf("build NovelAI request: %w", err)
	}
	upstreamReq.Header.Set("Content-Type", req.ContentType)
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
	if resp.StatusCode >= 400 {
		return s.novelAIUpstreamError(ctx, c, account, req, resp, target)
	}
	defer func() { _ = resp.Body.Close() }()

	for _, header := range []string{"Content-Type", "Content-Disposition", "Cache-Control", "X-Request-Id"} {
		if value := resp.Header.Get(header); value != "" {
			c.Header(header, value)
		}
	}
	c.Status(resp.StatusCode)
	firstTokenMs, copyErr := novelAICopyBody(c, resp.Body, start, req.Stream)

	result := &OpenAIForwardResult{
		RequestID: resp.Header.Get("x-request-id"), Model: req.Model, UpstreamModel: req.Model, BillingModel: req.Model,
		UpstreamEndpoint: req.Endpoint, Stream: req.Stream, ResponseHeaders: resp.Header.Clone(),
		Duration: time.Since(start), FirstTokenMs: firstTokenMs,
	}
	if req.Operation != NovelAIEncodeVibe {
		result.ImageCount = req.Samples
		result.ImageSize = req.BillingTier()
		result.ReferenceImageCount = req.ReferenceImages
	}
	return result, copyErr
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
