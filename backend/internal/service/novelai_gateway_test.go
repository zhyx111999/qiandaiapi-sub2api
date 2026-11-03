package service

import (
	"bytes"
	"mime/multipart"
	"testing"

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

	_, err = ParseNovelAIRequest("/ai/generate-image", "application/json", []byte(`{"parameters":{}}`))
	require.Error(t, err, "the model is required")
	_, err = ParseNovelAIRequest("/ai/generate-image", "application/json", []byte(`[1,2]`))
	require.Error(t, err)
	_, err = ParseNovelAIRequest("/v1/models", "application/json", []byte(`{"model":"x"}`))
	require.Error(t, err)
}
