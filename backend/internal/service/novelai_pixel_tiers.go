package service

// NovelAI pixel tiers: an extension of the per-request / image price card for the NovelAI channel.
//
// A card tier's range (MinTokens/MaxTokens) is measured in the unit of the request it prices:
// context tokens for the stock per-request tiers (FindMatchingInterval, (min, max]), and total
// pixels (width x height, both ends inclusive) for a NovelAI image, the way NovelAI's own Anlas
// cost grows with the image area. A NovelAI card can so carry any number of tiers (1MP, 1.5MP,
// 2MP, ...). A NovelAI image takes the first priced tier whose range holds its pixels; a row
// without a range (min 0, no max) is matched by its label only. Tier selection order lives in
// ModelPricingResolver.RequestTierPrice; the admin card editor labels the range as pixels on
// NovelAI cards, and the model plaza shows the tiers with their ranges.

// novelAIPixelRange reports whether a tier row defines a pixel range.
func novelAIPixelRange(iv *PricingInterval) bool {
	return iv.MinTokens > 0 || iv.MaxTokens != nil
}

// NovelAIPixelTier returns the priced tier whose pixel range holds pixels, or nil.
func NovelAIPixelTier(tiers []PricingInterval, pixels int64) *PricingInterval {
	if pixels <= 0 {
		return nil
	}
	for i := range tiers {
		iv := &tiers[i]
		if iv.PerRequestPrice == nil || !novelAIPixelRange(iv) {
			continue
		}
		if pixels >= int64(iv.MinTokens) && (iv.MaxTokens == nil || pixels <= int64(*iv.MaxTokens)) {
			return iv
		}
	}
	return nil
}

// NovelAIPixelTiers returns the tiers of a card that define pixel ranges, in card order.
func NovelAIPixelTiers(tiers []PricingInterval) []PricingInterval {
	out := make([]PricingInterval, 0, len(tiers))
	for i := range tiers {
		if tiers[i].PerRequestPrice != nil && novelAIPixelRange(&tiers[i]) {
			out = append(out, tiers[i])
		}
	}
	return out
}
