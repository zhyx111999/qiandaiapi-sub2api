package service

import "strings"

// NovelAI pricing on the stock billing: the request's total pixels map onto the same 1K / 2K / 4K
// tiers every image model uses, each model family has built-in image defaults that a group's
// image prices (or a channel price card) override, and Chat Completions on NovelAI models take a
// built-in token price from the stock fallback price table.

const (
	novelAIFamilyV45 = "nai-diffusion-4-5"
	novelAIFamilyV5  = "nai-diffusion-5"

	novelAIPixels1K = int64(1024 * 1024) // NovelAI "normal" sizes (832×1216, 1024×1024, …)
	novelAIPixels2K = int64(1536 * 2048) // the largest NovelAI generation size
)

// CanonicalNovelAIPriceFamily maps a NovelAI model onto its price family: V4 and V4.5 models
// (including their inpainting variants) share "nai-diffusion-4-5", V5 models "nai-diffusion-5".
// Other models (and older NovelAI generations) have no family.
func CanonicalNovelAIPriceFamily(model string) string {
	m := strings.ToLower(strings.TrimSpace(model))
	switch {
	case m == novelAIFamilyV5 || strings.HasPrefix(m, novelAIFamilyV5+"-"):
		return novelAIFamilyV5
	case m == novelAIFamilyV45 || strings.HasPrefix(m, novelAIFamilyV45+"-"),
		m == "nai-diffusion-4.5" || strings.HasPrefix(m, "nai-diffusion-4.5-"),
		m == "nai-diffusion-4-full" || m == "nai-diffusion-4-full-inpainting":
		return novelAIFamilyV45
	}
	return ""
}

// NovelAIImageBillingTier classifies a NovelAI generation by its total pixels: up to 1 MP is
// 1K, up to 3 MP (the NovelAI maximum) 2K, anything larger 4K. Unknown sizes return "" and
// settle at the stock default tier.
func NovelAIImageBillingTier(width, height int64) string {
	if width <= 0 || height <= 0 {
		return ""
	}
	switch pixels := width * height; {
	case pixels <= novelAIPixels1K:
		return ImageBillingSize1K
	case pixels <= novelAIPixels2K:
		return ImageBillingSize2K
	default:
		return ImageBillingSize4K
	}
}

// Built-in NovelAI prices (USD): per image by tier, and per reference image.
var novelAIDefaultImagePrices = map[string]map[string]float64{
	novelAIFamilyV45: {ImageBillingSize1K: 0.001, ImageBillingSize2K: 0.6, ImageBillingSize4K: 0.6},
	novelAIFamilyV5:  {ImageBillingSize1K: 0.035, ImageBillingSize2K: 0.9, ImageBillingSize4K: 0.9},
}

var novelAIDefaultReferencePrices = map[string]float64{
	novelAIFamilyV45: 0.05,
	novelAIFamilyV5:  0.075,
}

// novelAIFallbackPricingKey is the stock fallback price table entry of NovelAI chat: 1 token =
// $0.000001 for input and output alike.
const novelAIFallbackPricingKey = "nai-diffusion"

func novelAIFallbackTokenPricing() *ModelPricing {
	return &ModelPricing{InputPricePerToken: 0.000001, OutputPricePerToken: 0.000001}
}

// getDefaultNovelAIImagePrice returns the built-in per-image price of a NovelAI model.
func getDefaultNovelAIImagePrice(model, imageSize string) (float64, bool) {
	prices, ok := novelAIDefaultImagePrices[CanonicalNovelAIPriceFamily(model)]
	if !ok {
		return 0, false
	}
	price, ok := prices[NormalizeImageBillingTierOrDefault(imageSize)]
	return price, ok
}

// DefaultReferenceImagePrice is a model's built-in per-reference-image price (0 when it has none).
func DefaultReferenceImagePrice(model string) float64 {
	return novelAIDefaultReferencePrices[CanonicalNovelAIPriceFamily(model)]
}
