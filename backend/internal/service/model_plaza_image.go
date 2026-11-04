package service

// Image models in the model plaza. A model generates images when the pricing catalog says so
// (the model-price repo, LiteLLM's mode "image_generation"), when NovelAI serves it (NovelAI is
// not in the catalog), or when its price is per image. The plaza shows such a model by billing
// tier with what each tier covers, plus the per-reference-image price. The price of each tier
// stays in PlazaModel.Pricing.Intervals. NovelAI cards that tier by pixel range (see
// novelai_pixel_tiers.go) are shown with their own tiers and ranges.

// pricingModeImageGeneration is the catalog mode of image-generation models.
const pricingModeImageGeneration = "image_generation"

// PlazaImageTier is one billing tier of an image model: the largest image it covers (Width x
// Height), or for a NovelAI pixel tier its total-pixel range (MaxPixels 0 = no upper bound).
type PlazaImageTier struct {
	Label     string
	Width     int
	Height    int
	MinPixels int64
	MaxPixels int64
}

// PlazaImage marks an image-generation model.
type PlazaImage struct {
	// Tiers in ascending order, under the model's tier rule.
	Tiers []PlazaImageTier
	// ReferenceImagePrice is the surcharge per reference image (USD, before multipliers, settled
	// like the image itself); nil when reference images are free.
	ReferenceImagePrice *float64
}

// plazaEdgeImageTiers follow ClassifyImageBillingTier, which tiers by the longest edge: 1K up to
// 1024, 2K up to 2048. 4K is open above 2048 and shown at 4096, the largest size upstreams make.
var plazaEdgeImageTiers = []PlazaImageTier{
	{Label: ImageBillingSize1K, Width: 1024, Height: 1024},
	{Label: ImageBillingSize2K, Width: 2048, Height: 2048},
	{Label: ImageBillingSize4K, Width: 4096, Height: 4096},
}

// plazaNovelAIImageTiers follow NovelAIImageBillingTier, which tiers by total pixels: 1K up to
// novelAIPixels1K, 2K up to novelAIPixels2K, the largest NovelAI generation size (no 4K).
var plazaNovelAIImageTiers = []PlazaImageTier{
	{Label: ImageBillingSize1K, Width: 1024, Height: 1024},
	{Label: ImageBillingSize2K, Width: 1536, Height: 2048},
}

// plazaImage describes m as an image model in group g, or returns nil when it is not one. It reads
// the display pricing, so it runs after fillDisplayPricing.
func (s *ModelPlazaService) plazaImage(m *PlazaModel, g *Group) *PlazaImage {
	tiers := plazaEdgeImageTiers
	switch {
	case m.Platform == PlatformNovelAI:
		tiers = plazaNovelAITiers(m.Pricing)
	case m.Pricing != nil && m.Pricing.BillingMode == BillingModeImage:
	case s.catalogImageModel(m.Name):
	default:
		return nil
	}
	image := &PlazaImage{Tiers: tiers}
	if price := ReferenceImageUnitPrice(g, m.Name); price > 0 {
		image.ReferenceImagePrice = &price
	}
	return image
}

// plazaNovelAITiers returns the pixel tiers of a NovelAI card, or the stock 1K/2K tiers when the
// card defines no pixel ranges.
func plazaNovelAITiers(p *ChannelModelPricing) []PlazaImageTier {
	if p == nil {
		return plazaNovelAIImageTiers
	}
	ranged := NovelAIPixelTiers(p.Intervals)
	if len(ranged) == 0 {
		return plazaNovelAIImageTiers
	}
	tiers := make([]PlazaImageTier, 0, len(ranged))
	for _, iv := range ranged {
		tier := PlazaImageTier{Label: iv.TierLabel, MinPixels: int64(iv.MinTokens)}
		if iv.MaxTokens != nil {
			tier.MaxPixels = int64(*iv.MaxTokens)
		}
		tiers = append(tiers, tier)
	}
	return tiers
}

// catalogImageModel reports whether the pricing catalog identifies model as an image model. It
// uses the deterministic lookup: a family guess is no evidence of what a model outputs.
func (s *ModelPlazaService) catalogImageModel(model string) bool {
	pricing := s.pricingService.GetIdentifiedModelPricing(model)
	return pricing != nil && pricing.Mode == pricingModeImageGeneration
}
