package service

import (
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/stretchr/testify/require"
)

func TestCanonicalNovelAIPriceFamily(t *testing.T) {
	cases := map[string]string{
		"nai-diffusion-4-5-curated":            novelAIFamilyV45,
		"NAI-Diffusion-4-5-Full-Inpainting":    novelAIFamilyV45,
		"nai-diffusion-4-full":                 novelAIFamilyV45,
		"nai-diffusion-4-full-inpainting":      novelAIFamilyV45,
		"nai-diffusion-5-full":                 novelAIFamilyV5,
		"nai-diffusion-5":                      novelAIFamilyV5,
		"nai-diffusion-3":                      "",
		"nai-diffusion-4-curated-preview":      "",
		"gpt-image-2":                          "",
		"nai-diffusion-50-something-unrelated": "",
	}
	for model, want := range cases {
		require.Equal(t, want, CanonicalNovelAIPriceFamily(model), model)
	}
}

func TestNovelAIImageBillingTierByTotalPixels(t *testing.T) {
	require.Equal(t, ImageBillingSize1K, NovelAIImageBillingTier(832, 1216), "portrait normal size is 1K by pixels (2K by longest edge)")
	require.Equal(t, ImageBillingSize1K, NovelAIImageBillingTier(1024, 1024))
	require.Equal(t, ImageBillingSize2K, NovelAIImageBillingTier(1536, 1024))
	require.Equal(t, ImageBillingSize2K, NovelAIImageBillingTier(1536, 2048), "the NovelAI maximum is still 2K")
	require.Equal(t, ImageBillingSize4K, NovelAIImageBillingTier(2048, 2048))
	require.Equal(t, "", NovelAIImageBillingTier(0, 1024))
}

func TestNovelAIDefaultPrices(t *testing.T) {
	price, ok := getDefaultNovelAIImagePrice("nai-diffusion-4-5-full", ImageBillingSize1K)
	require.True(t, ok)
	require.InDelta(t, 0.001, price, 1e-12)
	price, _ = getDefaultNovelAIImagePrice("nai-diffusion-5-curated", ImageBillingSize2K)
	require.InDelta(t, 0.9, price, 1e-12)
	price, _ = getDefaultNovelAIImagePrice("nai-diffusion-5-curated", "")
	require.InDelta(t, 0.9, price, 1e-12, "an unknown size settles at the stock default tier (2K)")
	_, ok = getDefaultNovelAIImagePrice("gpt-image-2", ImageBillingSize1K)
	require.False(t, ok)

	require.InDelta(t, 0.05, DefaultReferenceImagePrice("nai-diffusion-4-full"), 1e-12)
	require.InDelta(t, 0.075, DefaultReferenceImagePrice("nai-diffusion-5-full"), 1e-12)
	require.Zero(t, DefaultReferenceImagePrice("gpt-image-2"))
}

func TestNovelAIChatTokenFallbackPrice(t *testing.T) {
	pricing, err := NewBillingService(&config.Config{}, nil).GetModelPricing("NAI-Diffusion-4-5-Full")
	require.NoError(t, err)
	require.InDelta(t, 0.000001, pricing.InputPricePerToken, 1e-15)
	require.InDelta(t, 0.000001, pricing.OutputPricePerToken, 1e-15)
}
