package service

import (
	"strings"

	"github.com/gin-gonic/gin"
)

// testNovelAIImageConnection is the account test of a NovelAI account: NovelAI only generates images, so the test
// generates one through Images (reusing the official API key image test) and the test window shows it. The Chat
// Completions test returned the image as a Markdown data URL in text, which the window can only print as text.
func (s *AccountTestService) testNovelAIImageConnection(c *gin.Context, account *Account, modelID, prompt string) error {
	model := strings.TrimSpace(modelID)
	if model == "" {
		model = account.providerDefaultTestModel()
	}
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		prompt = defaultOpenAIImageTestPrompt
	}
	return s.testOpenAIImageAPIKey(c, c.Request.Context(), account, account.GetMappedModel(model), prompt)
}
