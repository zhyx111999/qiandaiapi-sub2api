package service

import (
	"strings"

	"github.com/tidwall/gjson"
)

// CountInputImages counts the images a client sends with a generation request: the reference
// images of the group's reference surcharge (see ReferenceImageUnitPrice). It reads the user turns
// of the request shapes the gateways accept: Gemini contents[].parts (inlineData / fileData),
// Anthropic messages[].content image blocks, and OpenAI Chat / Responses image_url / input_image
// parts. Model turns (earlier outputs replayed as history) are not references.
func CountInputImages(body []byte) int {
	if len(body) == 0 || !gjson.ValidBytes(body) {
		return 0
	}
	count := 0
	gjson.GetBytes(body, "contents").ForEach(func(_, content gjson.Result) bool {
		if inputImageUserTurn(content) {
			content.Get("parts").ForEach(func(_, part gjson.Result) bool {
				if geminiInputImagePart(part) {
					count++
				}
				return true
			})
		}
		return true
	})
	for _, list := range []string{"messages", "input"} {
		gjson.GetBytes(body, list).ForEach(func(_, message gjson.Result) bool {
			if inputImageUserTurn(message) {
				message.Get("content").ForEach(func(_, part gjson.Result) bool {
					switch part.Get("type").String() {
					case "image", "image_url", "input_image":
						count++
					}
					return true
				})
			}
			return true
		})
	}
	return count
}

// imageReferenceCount is the reference count of a result that bills images, 0 otherwise.
func imageReferenceCount(imageCount int, body []byte) int {
	if imageCount <= 0 {
		return 0
	}
	return CountInputImages(body)
}

func inputImageUserTurn(turn gjson.Result) bool {
	role := strings.TrimSpace(turn.Get("role").String())
	return role == "" || strings.EqualFold(role, "user")
}

func geminiInputImagePart(part gjson.Result) bool {
	for _, key := range []string{"inlineData", "inline_data", "fileData", "file_data"} {
		data := part.Get(key)
		if !data.Exists() {
			continue
		}
		mimeType := data.Get("mimeType").String()
		if mimeType == "" {
			mimeType = data.Get("mime_type").String()
		}
		return mimeType == "" || strings.HasPrefix(strings.ToLower(mimeType), "image/")
	}
	return false
}
