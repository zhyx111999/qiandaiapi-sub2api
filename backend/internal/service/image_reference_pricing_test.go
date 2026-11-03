package service

import (
	"math"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestReferenceImageUnitPriceOrder(t *testing.T) {
	flat := 0.02
	group := &Group{
		ImageReferencePrice:       &flat,
		ImageReferenceModelPrices: map[string]float64{novelAIFamilyV5: 0.1, "gpt-image-2": 0.03},
	}
	require.InDelta(t, 0.1, ReferenceImageUnitPrice(group, "nai-diffusion-5-full"), 1e-12, "per-model map first")
	require.InDelta(t, 0.03, ReferenceImageUnitPrice(group, "GPT-Image-2"), 1e-12, "model IDs match case-insensitively")
	require.InDelta(t, 0.02, ReferenceImageUnitPrice(group, "nai-diffusion-4-5-full"), 1e-12, "then the flat price")
	require.InDelta(t, 0.05, ReferenceImageUnitPrice(&Group{}, "nai-diffusion-4-5-full"), 1e-12, "then the model default")
	require.Zero(t, ReferenceImageUnitPrice(nil, "gpt-image-2"), "models without a default carry no surcharge")
}

func TestNormalizeImageReferenceModelPrices(t *testing.T) {
	got := NormalizeImageReferenceModelPrices(map[string]float64{
		" NAI-Diffusion-5-Full ": 0.08, // a V5 model ID lands on the V5 family key
		"gpt-image-2":            0.01,
		"bad":                    -1,
		"nan":                    math.NaN(),
		"   ":                    0.5,
	})
	require.Equal(t, map[string]float64{novelAIFamilyV5: 0.08, "gpt-image-2": 0.01}, got)
	require.Nil(t, NormalizeImageReferenceModelPrices(map[string]float64{"bad": -1}))
}

func TestAddReferenceImageCost(t *testing.T) {
	cost := &CostBreakdown{TotalCost: 0.6, ActualCost: 0.9, ImageOutputCost: 0.6}
	got := AddReferenceImageCost(cost, 0.075, 2, 1.5)
	require.InDelta(t, 0.15, got.ImageInputCost, 1e-12)
	require.InDelta(t, 0.75, got.TotalCost, 1e-12)
	require.InDelta(t, 0.9+0.225, got.ActualCost, 1e-12, "settled with the image multiplier")

	unchanged := &CostBreakdown{TotalCost: 1, ActualCost: 1}
	require.Equal(t, &CostBreakdown{TotalCost: 1, ActualCost: 1}, AddReferenceImageCost(unchanged, 0, 3, 1))
	require.Equal(t, &CostBreakdown{TotalCost: 1, ActualCost: 1}, AddReferenceImageCost(unchanged, 0.05, 0, 1))
	require.Nil(t, AddReferenceImageCost(nil, 0.05, 1, 1))
}
