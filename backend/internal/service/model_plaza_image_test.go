//go:build unit

package service

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPlazaImageTiersMatchBillingClassifiers(t *testing.T) {
	// Each tier's resolution is the largest image the billing classifier puts in that tier.
	for _, tier := range plazaEdgeImageTiers {
		got, ok := ClassifyImageBillingTier(fmt.Sprintf("%dx%d", tier.Width, tier.Height))
		require.True(t, ok)
		require.Equal(t, tier.Label, got)
	}
	for _, tier := range plazaNovelAIImageTiers {
		require.Equal(t, tier.Label, NovelAIImageBillingTier(int64(tier.Width), int64(tier.Height)))
	}
	last := plazaNovelAIImageTiers[len(plazaNovelAIImageTiers)-1]
	require.Equal(t, novelAIPixels2K, int64(last.Width*last.Height), "2K ends at the largest NovelAI size")
}

func TestListGroups_MarksImageModels(t *testing.T) {
	catalog := newStubPricingServiceFromMap(map[string]*LiteLLMModelPricing{
		"gpt-image-2":  {Mode: pricingModeImageGeneration, InputCostPerToken: 5e-6},
		"gpt-6.1-sol":  {Mode: "chat", InputCostPerToken: 1e-6},
		"gemini-image": {Mode: pricingModeImageGeneration, OutputCostPerImage: 0.04},
	})
	channels := []Channel{
		plazaPricedChannel(1, "openai", []int64{10}, PlatformOpenAI, "gpt-image-2", "gpt-6.1-sol", "gpt-image-9"),
		{
			ID: 2, Name: "image", Status: StatusActive, GroupIDs: []int64{10},
			ModelPricing: []ChannelModelPricing{{
				Platform: PlatformOpenAI, Models: []string{"house-image"}, BillingMode: BillingModeImage,
				PerRequestPrice: testPtrFloat64(0.02),
			}},
		},
		{
			ID: 3, Name: "nai", Status: StatusActive, GroupIDs: []int64{20},
			ModelPricing: []ChannelModelPricing{{
				Platform: PlatformNovelAI, Models: []string{"nai-diffusion-5-full"}, BillingMode: BillingModeImage,
				PerRequestPrice: testPtrFloat64(0.035),
			}},
		},
	}
	reference := 0.01
	groups := []Group{
		{ID: 10, Platform: PlatformOpenAI, RateMultiplier: 1, ImageReferencePrice: &reference},
		{ID: 20, Platform: PlatformNovelAI, RateMultiplier: 1},
	}
	out, err := newPlazaService(channels, groups, catalog).ListGroups(context.Background())
	require.NoError(t, err)
	require.Len(t, out, 2)

	images := map[string]*PlazaImage{}
	for _, g := range out {
		for i := range g.Models {
			images[g.Models[i].Name] = g.Models[i].Image
		}
	}
	// Catalog says image: shown as an image model at the longest-edge tiers.
	require.NotNil(t, images["gpt-image-2"])
	require.Equal(t, plazaEdgeImageTiers, images["gpt-image-2"].Tiers)
	require.Equal(t, 0.01, *images["gpt-image-2"].ReferenceImagePrice)
	// Catalog chat model, and a model the catalog does not identify: not image models.
	require.Nil(t, images["gpt-6.1-sol"])
	require.Nil(t, images["gpt-image-9"])
	// Billed per image: an image model whatever the catalog says.
	require.NotNil(t, images["house-image"])
	// NovelAI: total-pixel tiers and the built-in v5 reference price.
	nai := images["nai-diffusion-5-full"]
	require.NotNil(t, nai)
	require.Equal(t, plazaNovelAIImageTiers, nai.Tiers)
	require.Equal(t, DefaultReferenceImagePrice("nai-diffusion-5-full"), *nai.ReferenceImagePrice)
}
