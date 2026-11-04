package service

// NovelAI images are priced by their total pixels, the way NovelAI's own Anlas cost grows with
// the image area. On a per-request or image price card, the tier rows of a NovelAI image hold
// total pixels in min/max (both ends inclusive), so a card can carry any number of tiers (1MP,
// 1.5MP, 2MP, …). A request takes the first tier whose range holds its pixels; a row without a
// range (min 0, no max) is matched by its label only, as before. When no range holds the request,
// pricing falls back to the stock 1K/2K label and then to the card's flat price.

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
