package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
)

const (
	novelAIUpscaleCostUSD    = 0.01
	novelAIEncodeVibeCostUSD = 0.02
	novelAIAnlasCostUSD      = 0.01

	// Bounds for locally quoted Director requests, not a claim of upstream size
	// support. Check each side and the product before multiplying: even a bogus
	// request must not overflow into a free or negative quote. 64 MP leaves room
	// above the calibrated/generation sizes without accepting unbounded images.
	novelAIAugmentMaxDimension int64 = 8192
	novelAIAugmentMaxPixels    int64 = 64 * 1024 * 1024
)

var errNovelAIUnknownAugmentType = errors.New("unpriced NovelAI augment req_type")

// novelAIAugmentAnlas is a calibrated tariff for this deployment's ACTIVE OPUS
// upstream pool, NOT official guaranteed live metering. Samples on 2026-11-16:
// bg-removal at 64²/256²/512²/1024²/1536x1024 cost 8/11/20/65/95 Anlas;
// all five other tools were free through 1024² and cost 30 at 1536x1024;
// emotion at 1088x1024 cost 22. Sampled defry 0/5 and trial true/false/omitted
// did not change these costs. Recalibrate if the pool's subscription changes.
//
// C = ceil(pixels * (2.951823174884865e-6 + 28 * 5.753298233447344e-7)).
// There is no 65536-pixel floor and no minimum C of 2. Background removal is
// 3*C+5; the other tools are free at <=1 MP and C above that threshold.
func novelAIAugmentAnlas(reqType string, width, height int64) (int64, error) {
	pixels, err := novelAIAugmentPixels(width, height)
	if err != nil {
		return 0, err
	}
	// The bounded integer product is exactly representable as float64; both C
	// and 3*C+5 are far below the int64 limit throughout the accepted domain.
	base := int64(math.Ceil(float64(pixels) * (2.951823174884865e-6 + 28*5.753298233447344e-7)))
	switch reqType {
	case "bg-removal":
		return 3*base + 5, nil
	case "emotion", "colorize", "declutter", "lineart", "sketch":
		if pixels <= novelAIPixels1K {
			return 0, nil
		}
		return base, nil
	default:
		return 0, errNovelAIUnknownAugmentType
	}
}

func novelAIAugmentPixels(width, height int64) (int64, error) {
	if width <= 0 || height <= 0 || width > novelAIAugmentMaxDimension || height > novelAIAugmentMaxDimension ||
		width > novelAIAugmentMaxPixels/height {
		return 0, fmt.Errorf("augment dimensions must be positive integers, each <= %d and total pixels <= %d", novelAIAugmentMaxDimension, novelAIAugmentMaxPixels)
	}
	return width * height, nil
}

// novelAIAugmentDimension accepts integer JSON dimensions without truncating
// fractions, coercing strings or converting unchecked floats. Decoding directly
// into int64 also rejects fractional values that float64 would round to integers.
func novelAIAugmentDimension(raw json.RawMessage, name string) (int64, error) {
	var value int64
	if json.Unmarshal(raw, &value) != nil || value <= 0 || value > novelAIAugmentMaxDimension {
		return 0, fmt.Errorf("augment %s must be a positive integer <= %d", name, novelAIAugmentMaxDimension)
	}
	return value, nil
}

// quoteNovelAINativeRequest runs only after operation-specific parsing. An
// unknown Director type still goes upstream for its native validation error.
// Its quote is a conservative reservation (the highest known tool's price at
// these dimensions), never a settlement: ForwardNovelAI rejects an unexpected
// successful response before releasing any output or billable result.
func quoteNovelAINativeRequest(req *NovelAIRequest) error {
	var cost float64
	switch req.Operation {
	case NovelAIUpscale:
		cost = novelAIUpscaleCostUSD
	case NovelAIEncodeVibe:
		cost = novelAIEncodeVibeCostUSD
	case NovelAIAugmentImage:
		anlas, err := novelAIAugmentAnlas(req.ReqType, req.Width, req.Height)
		if errors.Is(err, errNovelAIUnknownAugmentType) {
			anlas, err = novelAIAugmentAnlas("bg-removal", req.Width, req.Height)
		}
		if err != nil {
			return err
		}
		cost = float64(anlas) * novelAIAnlasCostUSD
	default:
		return nil
	}
	req.NativeCostUSD = &cost
	return nil
}

// ResolveNovelAINativeRateMultiplier resolves a native utility's rate once at
// admission: system default or user/group rate, times the selected account's
// user-group rate. The handler saves it on the request before reserving the
// charge; forwarding/settlement must not re-resolve it after the cache expires.
// Token peak factors, image overrides and model tariffs do not affect this rate.
func (s *OpenAIGatewayService) ResolveNovelAINativeRateMultiplier(ctx context.Context, apiKey *APIKey, account *Account) float64 {
	userID := int64(0)
	if apiKey != nil {
		userID = apiKey.UserID
		if apiKey.User != nil {
			userID = apiKey.User.ID
		}
	}
	return math.Max(0, s.openAIUsageBaseMultiplier(ctx, apiKey, account, userID))
}

// ResolveNovelAINativeCharge is a one-off estimate. Native request admission
// must save ResolveNovelAINativeRateMultiplier and multiply that snapshot by
// NativeCostUSD, so the same rate can be used for eventual settlement.
func (s *OpenAIGatewayService) ResolveNovelAINativeCharge(ctx context.Context, apiKey *APIKey, account *Account, baseCost float64) float64 {
	return baseCost * s.ResolveNovelAINativeRateMultiplier(ctx, apiKey, account)
}

func novelAINativeRateSnapshot(rate *float64) (float64, error) {
	if rate == nil {
		return 0, errors.New("NovelAI native utility has no reserved rate multiplier")
	}
	if math.IsNaN(*rate) || math.IsInf(*rate, 0) || *rate < 0 {
		return 0, errors.New("invalid NovelAI native utility reserved rate multiplier")
	}
	return *rate, nil
}

func calculateNovelAINativeCost(baseCost, rateMultiplier float64) (*CostBreakdown, error) {
	if math.IsNaN(baseCost) || math.IsInf(baseCost, 0) || baseCost < 0 || math.IsNaN(rateMultiplier) || math.IsInf(rateMultiplier, 0) {
		return nil, errors.New("invalid NovelAI native utility quote or multiplier")
	}
	actualCost := baseCost * math.Max(0, rateMultiplier)
	if math.IsInf(actualCost, 0) {
		return nil, errors.New("NovelAI native utility charge overflow")
	}
	return &CostBreakdown{
		TotalCost: baseCost, ActualCost: actualCost, BillingMode: string(BillingModePerRequest),
	}, nil
}
