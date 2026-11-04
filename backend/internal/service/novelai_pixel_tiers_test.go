//go:build unit

package service

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

// novelAITestLadder is the card shape her NovelAI channel uses: five tiers by total pixels.
func novelAITestLadder() []PricingInterval {
	tier := func(label string, minPixels int, maxPixels *int, price float64) PricingInterval {
		return PricingInterval{TierLabel: label, MinTokens: minPixels, MaxTokens: maxPixels, PerRequestPrice: &price}
	}
	return []PricingInterval{
		tier("1MP", 0, testPtrInt(1048576), 0.05),
		tier("1.5MP", 1048577, testPtrInt(1572864), 0.5),
		tier("2MP", 1572865, testPtrInt(2097152), 0.65),
		tier("2.5MP", 2097153, testPtrInt(2621440), 0.8),
		tier("3MP", 2621441, nil, 0.95),
	}
}

func TestNovelAIPixelTier(t *testing.T) {
	ladder := novelAITestLadder()
	for _, c := range []struct {
		pixels int64
		want   string
	}{
		{832 * 1216, "1MP"},
		{1024 * 1024, "1MP"}, // both ends inclusive
		{1048577, "1.5MP"},
		{1216 * 1216, "1.5MP"},
		{1408 * 1408, "2MP"},
		{1536 * 1536, "2.5MP"},
		{1536 * 2048, "3MP"}, // open top tier
	} {
		tier := NovelAIPixelTier(ladder, c.pixels)
		require.NotNil(t, tier, "pixels %d", c.pixels)
		require.Equal(t, c.want, tier.TierLabel, "pixels %d", c.pixels)
	}
	require.Nil(t, NovelAIPixelTier(ladder, 0))

	// Rows without a range or without a price take no part.
	labelOnly := func(label string, price float64) PricingInterval {
		return PricingInterval{TierLabel: label, PerRequestPrice: &price}
	}
	unpriced := PricingInterval{TierLabel: "1MP", MaxTokens: testPtrInt(1048576)}
	require.Nil(t, NovelAIPixelTier([]PricingInterval{labelOnly("1K", 0.05), labelOnly("2K", 0.9), unpriced}, 1024*1024))
	require.Len(t, NovelAIPixelTiers(append(ladder, labelOnly("1K", 0.05), unpriced)), 5)
}

func TestCalculatePerRequestCost_NovelAIPixelTiers(t *testing.T) {
	svc := &BillingService{}
	resolver := &ModelPricingResolver{}
	flat := 0.05
	resolved := &ResolvedPricing{Mode: BillingModeImage, RequestTiers: novelAITestLadder(), DefaultPerRequestPrice: flat}

	// 1216x1216 is in the 1.5MP tier; two images, rate 2.
	cost, err := svc.calculatePerRequestCost(resolved, CostInput{
		Ctx: context.Background(), RequestCount: 2, SizeTier: ImageBillingSize2K, ImagePixels: 1216 * 1216,
		RateMultiplier: 2, Resolver: resolver,
	})
	require.NoError(t, err)
	require.InDelta(t, 1.0, cost.TotalCost, 1e-12)
	require.InDelta(t, 2.0, cost.ActualCost, 1e-12)

	// An explicit zero-price tier is free, not a fallback to the flat price.
	zero := novelAITestLadder()
	*zero[0].PerRequestPrice = 0
	cost, err = svc.calculatePerRequestCost(&ResolvedPricing{RequestTiers: zero, DefaultPerRequestPrice: flat}, CostInput{
		RequestCount: 1, ImagePixels: 832 * 1216, RateMultiplier: 1, Resolver: resolver,
	})
	require.NoError(t, err)
	require.Zero(t, cost.TotalCost)

	// Cards without pixel ranges keep the stock label lookup.
	price1K, price2K := 0.035, 0.9
	labelCard := &ResolvedPricing{RequestTiers: []PricingInterval{
		{TierLabel: ImageBillingSize1K, PerRequestPrice: &price1K},
		{TierLabel: ImageBillingSize2K, PerRequestPrice: &price2K},
	}, DefaultPerRequestPrice: flat}
	cost, err = svc.calculatePerRequestCost(labelCard, CostInput{
		RequestCount: 1, SizeTier: ImageBillingSize2K, ImagePixels: 1216 * 1216, RateMultiplier: 1, Resolver: resolver,
	})
	require.NoError(t, err)
	require.InDelta(t, price2K, cost.TotalCost, 1e-12)
}

func TestListGroups_NovelAIPixelTiersShownFromCard(t *testing.T) {
	flat := 0.05
	channel := Channel{
		ID: 1, Name: "nai", Status: StatusActive, GroupIDs: []int64{7},
		ModelPricing: []ChannelModelPricing{{
			Platform: PlatformNovelAI, Models: []string{"nai-diffusion-5-full"}, BillingMode: BillingModeImage,
			PerRequestPrice: &flat, Intervals: novelAITestLadder(),
		}},
	}
	out, err := newPlazaService([]Channel{channel}, []Group{{ID: 7, Platform: PlatformNovelAI, RateMultiplier: 1}}, nil).
		ListGroups(context.Background())
	require.NoError(t, err)
	image := out[0].Models[0].Image
	require.NotNil(t, image)
	require.Equal(t, []PlazaImageTier{
		{Label: "1MP", MaxPixels: 1048576},
		{Label: "1.5MP", MinPixels: 1048577, MaxPixels: 1572864},
		{Label: "2MP", MinPixels: 1572865, MaxPixels: 2097152},
		{Label: "2.5MP", MinPixels: 2097153, MaxPixels: 2621440},
		{Label: "3MP", MinPixels: 2621441},
	}, image.Tiers)
}
