package service

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCountInputImages(t *testing.T) {
	gemini := `{"contents":[
		{"role":"user","parts":[{"text":"make it blue"},{"inlineData":{"mimeType":"image/png","data":"AAA"}},{"file_data":{"mime_type":"image/jpeg","file_uri":"gs://x"}}]},
		{"role":"model","parts":[{"inlineData":{"mimeType":"image/png","data":"BBB"}}]},
		{"parts":[{"inline_data":{"mime_type":"application/pdf","data":"CCC"}},{"inlineData":{"data":"DDD"}}]}]}`
	require.Equal(t, 3, CountInputImages([]byte(gemini)), "user turns only; non-image MIME types skipped")

	anthropic := `{"messages":[{"role":"user","content":[{"type":"image","source":{"type":"base64","data":"AAA"}},{"type":"text","text":"x"}]},
		{"role":"assistant","content":[{"type":"image","source":{}}]},{"role":"user","content":"plain"}]}`
	require.Equal(t, 1, CountInputImages([]byte(anthropic)))

	chat := `{"messages":[{"role":"user","content":[{"type":"image_url","image_url":{"url":"data:image/png;base64,AAA"}},{"type":"image_url","image_url":{"url":"https://x/y.png"}}]}]}`
	require.Equal(t, 2, CountInputImages([]byte(chat)))

	responses := `{"input":[{"role":"user","content":[{"type":"input_text","text":"x"},{"type":"input_image","image_url":"data:image/png;base64,AAA"}]},{"type":"function_call_output","output":"x"}]}`
	require.Equal(t, 1, CountInputImages([]byte(responses)))
	require.Zero(t, CountInputImages([]byte(`{"input":"just text"}`)))
	require.Zero(t, CountInputImages([]byte(`not json`)))

	require.Zero(t, imageReferenceCount(0, []byte(chat)), "results that bill no image carry no references")
	require.Equal(t, 2, imageReferenceCount(1, []byte(chat)))
}
