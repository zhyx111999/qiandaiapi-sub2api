package service

import (
	"math"
	"strings"
)

// Reference images on image generation requests (style / character / vibe references sent
// alongside the prompt) can carry a per-image surcharge on top of the image price. The price
// follows the same order as video per-model pricing:
//
//  1. the group's per-model map (groups.image_reference_model_prices, family → USD per image);
//  2. the group's flat price (groups.image_reference_price);
//  3. the model's built-in default (DefaultReferenceImagePrice; 0 for models without one).
//
// The surcharge is part of the image input cost and is settled with the same multiplier as the
// image itself.

// ReferenceImagePriceFamily is the key a model's reference price is stored under: the canonical
// NovelAI price family where there is one, otherwise the lower-cased model ID.
func ReferenceImagePriceFamily(model string) string {
	if family := CanonicalNovelAIPriceFamily(model); family != "" {
		return family
	}
	return strings.ToLower(strings.TrimSpace(model))
}

// NormalizeImageReferenceModelPrices cleans a per-model reference price map: trimmed lower-cased
// family keys, finite non-negative prices; nil when nothing is left.
func NormalizeImageReferenceModelPrices(in map[string]float64) map[string]float64 {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]float64, len(in))
	for key, price := range in {
		family := ReferenceImagePriceFamily(key)
		if family == "" || math.IsNaN(price) || math.IsInf(price, 0) || price < 0 {
			continue
		}
		out[family] = price
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// ReferenceImageUnitPrice resolves the per-reference-image price for `model` in `group`.
func ReferenceImageUnitPrice(group *Group, model string) float64 {
	if group != nil {
		if price, ok := group.ImageReferenceModelPrices[ReferenceImagePriceFamily(model)]; ok {
			return price
		}
		if group.ImageReferencePrice != nil && *group.ImageReferencePrice >= 0 {
			return *group.ImageReferencePrice
		}
	}
	return DefaultReferenceImagePrice(model)
}

// AddReferenceImageCost adds `count` reference images at `unitPrice` each to an image cost,
// settled with `multiplier` like the image itself. A nil cost stays nil.
func AddReferenceImageCost(cost *CostBreakdown, unitPrice float64, count int, multiplier float64) *CostBreakdown {
	if cost == nil || count <= 0 || unitPrice <= 0 {
		return cost
	}
	if multiplier < 0 {
		multiplier = 0
	}
	surcharge := unitPrice * float64(count)
	cost.ImageInputCost += surcharge
	cost.TotalCost += surcharge
	cost.ActualCost += surcharge * multiplier
	return cost
}

func referenceImageGroup(apiKey *APIKey) *Group {
	if apiKey == nil {
		return nil
	}
	return apiKey.Group
}
