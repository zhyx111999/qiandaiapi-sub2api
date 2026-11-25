package service

import (
	"strings"

	"github.com/tidwall/gjson"
)

// novelAIChatImages reads the image facts carried by nai-station's Chat
// response. The response and upstream token usage remain unchanged. The shared
// billing pipeline then applies the existing channel/group image or token price.
// Only assistant output is observed; images mentioned in prompts are not output.
type novelAIChatImages struct {
	choices map[int]*strings.Builder
}

func newNovelAIChatImages(account *Account) *novelAIChatImages {
	if account == nil || account.Platform != PlatformNovelAI {
		return nil
	}
	return &novelAIChatImages{choices: make(map[int]*strings.Builder)}
}

func (o *novelAIChatImages) Observe(payload string) {
	if o == nil || !gjson.Valid(payload) {
		return
	}
	for _, choice := range gjson.Get(payload, "choices").Array() {
		content := choice.Get("delta.content")
		if !content.Exists() {
			content = choice.Get("message.content")
		}
		if content.Type != gjson.String || content.Str == "" {
			continue
		}
		index := int(choice.Get("index").Int())
		text := o.choices[index]
		if text == nil {
			text = &strings.Builder{}
			o.choices[index] = text
		}
		text.WriteString(content.Str)
	}
}

func (o *novelAIChatImages) Apply(result *OpenAIForwardResult) {
	if o == nil || result == nil {
		return
	}
	count := 0
	var width, height int64
	for _, text := range o.choices {
		remaining := text.String()
		for {
			start := strings.Index(remaining, "![")
			if start < 0 {
				break
			}
			remaining = remaining[start+2:]
			_, target, ok := strings.Cut(remaining, "](")
			if !ok {
				break
			}
			imageURL, rest, complete := strings.Cut(target, ")")
			if !complete {
				break // A truncated data URL is not a delivered image.
			}
			remaining = rest
			if !strings.HasPrefix(imageURL, "data:image/png;base64,") {
				continue
			}
			w, h, valid := parseImageBillingDimensions(detectOpenAIImageResultSize(imageURL))
			if !valid {
				continue
			}
			count++
			if int64(w)*int64(h) > width*height {
				width, height = int64(w), int64(h)
			}
		}
	}
	result.ImageCount = count
	if count > 0 {
		result.ImagePixels = width * height
		result.ImageSize = NovelAIImageBillingTier(width, height)
		// Do not set ImageOutputSize: generic longest-edge resolution would
		// override NovelAI's area-based tier (e.g. 832x1216 belongs to 1K).
	}
}

// nai-station reads only the final user message, either a string or a single
// text part. Character references are the Chat compatibility layer's supported
// reference input; img2img/inpainting input and earlier messages are not extras.
func novelAIChatReferenceCount(body []byte) int {
	messages := gjson.GetBytes(body, "messages").Array()
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Get("role").String() != "user" {
			continue
		}
		content := messages[i].Get("content")
		if content.IsArray() {
			parts := content.Array()
			if len(parts) != 1 || parts[0].Get("type").String() != "text" {
				return 0
			}
			content = parts[0].Get("text")
		}
		if content.Type != gjson.String || !gjson.Valid(content.Str) {
			return 0
		}
		count := 0
		for _, ref := range gjson.Get(content.Str, "character_references").Array() {
			if novelAIReferenceAsset(ref.Get("image").String()) {
				count++
			}
		}
		return count
	}
	return 0
}
