package service

import (
	"context"
	"fmt"
	"math"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/stretchr/testify/require"
)

func TestNovelAIAugmentCalibratedActiveOpusAnlas(t *testing.T) {
	for _, tc := range []struct {
		width, height, anlas int64
	}{
		{8, 8, 8}, // no 65536-pixel floor and no minimum C of 2
		{64, 64, 8}, {256, 256, 11}, {512, 512, 20},
		{1024, 1024, 65}, {1536, 1024, 95},
	} {
		anlas, err := novelAIAugmentAnlas("bg-removal", tc.width, tc.height)
		require.NoError(t, err)
		require.Equal(t, tc.anlas, anlas, "bg-removal %dx%d", tc.width, tc.height)
	}
	for _, reqType := range []string{"emotion", "colorize", "declutter", "lineart", "sketch"} {
		for _, tc := range []struct {
			width, height, anlas int64
		}{
			{1, 1, 0}, {64, 64, 0}, {512, 512, 0}, {1024, 1024, 0},
			{2048, 512, 0}, // free boundary is total pixels, not longest edge
			{1025, 1024, 21}, {1088, 1024, 22}, {1536, 1024, 30},
		} {
			anlas, err := novelAIAugmentAnlas(reqType, tc.width, tc.height)
			require.NoError(t, err)
			require.Equal(t, tc.anlas, anlas, "%s %dx%d", reqType, tc.width, tc.height)
		}
	}
	_, err := novelAIAugmentAnlas("bogus-probe", 8, 8)
	require.ErrorIs(t, err, errNovelAIUnknownAugmentType)
	_, err = novelAIAugmentAnlas("Emotion", 1024, 1024)
	require.ErrorIs(t, err, errNovelAIUnknownAugmentType, "do not silently normalize an unrecognized paid operation to free")
}

func TestNovelAIAugmentDefryAndTrialDoNotAlterCalibratedQuote(t *testing.T) {
	for _, reqType := range []string{"emotion", "colorize"} {
		for _, defry := range []string{"", `,"defry":0`, `,"defry":5`} {
			for _, trial := range []string{"", `,"use_new_shared_trial":true`, `,"use_new_shared_trial":false`} {
				for _, width := range []int{1024, 1536} {
					body := fmt.Sprintf(`{"req_type":%q,"width":%d,"height":1024%s%s}`, reqType, width, defry, trial)
					req, err := ParseNovelAIRequest("/ai/augment-image", "application/json", []byte(body))
					require.NoError(t, err)
					require.NotNil(t, req.NativeCostUSD)
					want := 0.0
					if width == 1536 {
						want = 0.30
					}
					require.InDelta(t, want, *req.NativeCostUSD, 1e-12, body)
				}
			}
		}
	}
}

func TestNovelAIAugmentPricingBounds(t *testing.T) {
	for _, dimensions := range [][2]int64{
		{0, 1}, {1, 0}, {-1, 1024}, {1024, -1},
		{novelAIAugmentMaxDimension + 1, 1}, {1, novelAIAugmentMaxDimension + 1},
		{math.MaxInt64, 2}, {2, math.MaxInt64}, {math.MaxInt64, math.MaxInt64},
	} {
		anlas, err := novelAIAugmentAnlas("bg-removal", dimensions[0], dimensions[1])
		require.Error(t, err, "%v", dimensions)
		require.Zero(t, anlas)
	}
	anlas, err := novelAIAugmentAnlas("bg-removal", novelAIAugmentMaxDimension, novelAIAugmentMaxDimension)
	require.NoError(t, err)
	require.Equal(t, int64(3845), anlas, "safe upper-bound arithmetic")
	last := int64(0)
	for width := int64(1); width <= novelAIAugmentMaxDimension; width++ {
		anlas, err := novelAIAugmentAnlas("bg-removal", width, 1024)
		require.NoError(t, err)
		require.GreaterOrEqual(t, anlas, last, "pricing must be monotonic")
		last = anlas
	}
}

func TestNovelAINativeCostDispatchPrecedesEveryModelPrice(t *testing.T) {
	const model = "nai-diffusion-5-full"
	groupID := int64(331)
	conflictingPrice := 12.0
	for _, source := range []string{PricingSourceGroup, PricingSourceChannel} {
		for _, mode := range []BillingMode{BillingModeToken, BillingModeImage, BillingModePerRequest} {
			for _, quote := range []float64{0, 0.01, 0.02, 0.30, 0.95} {
				t.Run(fmt.Sprintf("%s/%s/%g", source, mode, quote), func(t *testing.T) {
					card := ChannelModelPricing{
						Models: []string{model}, BillingMode: mode,
						InputPrice: &conflictingPrice, OutputPrice: &conflictingPrice,
						PerRequestPrice: &conflictingPrice,
					}
					group := &Group{ID: groupID, Platform: PlatformNovelAI, Hydrated: true,
						ImagePrice1K: &conflictingPrice, ImagePrice2K: &conflictingPrice,
						ImageReferencePrice: &conflictingPrice,
					}
					cache := newEmptyChannelCache()
					cache.pricingByGroupModel[channelModelKey{groupID: groupID, model: model}] = &card
					cache.channelByGroupID[groupID] = &Channel{ID: groupID, Status: StatusActive}
					cache.groupPlatform[groupID] = ""
					cache.loadedAt = time.Now()
					channelService := &ChannelService{}
					channelService.cache.Store(cache)
					if source == PricingSourceGroup {
						group.ModelPricing = []ChannelModelPricing{card}
					}
					billing := NewBillingService(&config.Config{}, nil)
					svc := &OpenAIGatewayService{billingService: billing, resolver: NewModelPricingResolver(channelService, billing)}
					key := &APIKey{GroupID: &groupID, Group: group}
					result := &OpenAIForwardResult{
						Model: model, NovelAINativeCostUSD: &quote, NovelAINativeRateMultiplier: f64p(0.4),
						// Deliberate conflicting units must not add generation/reference
						// or token fees to a native endpoint tariff.
						ImageCount: 2, ImageSize: ImageBillingSize1K, ReferenceImageCount: 3,
					}
					resolved := svc.resolveOpenAIChannelPricing(context.Background(), model, key)
					require.NotNil(t, resolved)
					require.Equal(t, source, resolved.Source)
					require.Equal(t, mode, resolved.Mode)
					cost, err := svc.calculateOpenAIRecordUsageCost(context.Background(), result, key, []string{model},
						17, 19, 23, 29, UsageTokens{InputTokens: 2000, OutputTokens: 3000}, "priority", nil, false, time.Time{})
					require.NoError(t, err)
					require.Equal(t, string(BillingModePerRequest), cost.BillingMode)
					require.InDelta(t, quote, cost.TotalCost, 1e-12)
					require.InDelta(t, quote*0.4, cost.ActualCost, 1e-12, "uses non-peak base rate, not generation image multiplier")
					require.Zero(t, cost.InputCost)
					require.Zero(t, cost.ImageOutputCost)
				})
			}
		}
	}
}

func TestNovelAINativeChargeMatchesBaseUsageMultiplier(t *testing.T) {
	cfg := &config.Config{}
	cfg.Default.RateMultiplier = 1.2
	userRate, accountRate := 0.4, 2.5
	groupID := int64(20)
	repo := &userGroupRateResolverRepoStub{rate: &userRate}
	svc := &OpenAIGatewayService{cfg: cfg, userGroupRateResolver: newUserGroupRateResolver(repo, nil, time.Minute, nil, "service.test")}
	key := &APIKey{UserID: 10, User: &User{ID: 10}, GroupID: &groupID, Group: &Group{
		ID: groupID, RateMultiplier: 0.6, ImageRateIndependent: true, ImageRateMultiplier: 99,
		SubscriptionType: SubscriptionTypeSubscription, PeakRateEnabled: true,
		PeakStart: "00:00", PeakEnd: "23:59", PeakRateMultiplier: 7,
	}}
	account := &Account{GroupRateMultiplier: &accountRate}
	base := svc.openAIUsageBaseMultiplier(context.Background(), key, account, key.User.ID)
	require.InDelta(t, 1.0, base, 1e-12, "user rate overrides group then multiplies selected account rate")
	for _, quote := range []float64{0, 0.01, 0.02, 0.65} {
		charge := svc.ResolveNovelAINativeCharge(context.Background(), key, account, quote)
		cost, err := calculateNovelAINativeCost(quote, base)
		require.NoError(t, err)
		require.InDelta(t, cost.ActualCost, charge, 1e-12)
		require.InDelta(t, quote, charge, 1e-12, "neither peak nor image-specific overrides apply")
	}
	require.Equal(t, 1, repo.calls, "reservation/settlement share the rate cache")
	withoutResolver := &OpenAIGatewayService{cfg: cfg}
	require.InDelta(t, 0.03, withoutResolver.ResolveNovelAINativeCharge(context.Background(), key, account, 0.02), 1e-12)
	require.InDelta(t, 0.024, withoutResolver.ResolveNovelAINativeCharge(context.Background(), &APIKey{}, nil, 0.02), 1e-12)
	var nilSvc *OpenAIGatewayService
	require.InDelta(t, 0.02, nilSvc.ResolveNovelAINativeCharge(context.Background(), nil, nil, 0.02), 1e-12)
}

func TestNovelAINativeRecordUsageSettlesQuoteAndLogsBaseMultiplier(t *testing.T) {
	for _, quote := range []float64{0, 0.01, 0.02, 0.30, 0.95} {
		t.Run(fmt.Sprint(quote), func(t *testing.T) {
			usageRepo := &openAIRecordUsageLogRepoStub{inserted: true}
			userRepo := &openAIRecordUsageUserRepoStub{}
			svc := newOpenAIRecordUsageServiceForTest(usageRepo, userRepo, &openAIRecordUsageSubRepoStub{}, nil)
			groupID, accountRate := int64(332), 2.0
			key := &APIKey{ID: 1002, UserID: 2002, User: &User{ID: 2002}, GroupID: &groupID, Group: &Group{
				ID: groupID, Platform: PlatformNovelAI, RateMultiplier: 0.4,
				ImageRateIndependent: true, ImageRateMultiplier: 99,
				SubscriptionType: SubscriptionTypeSubscription, PeakRateEnabled: true,
				PeakStart: "00:00", PeakEnd: "23:59", PeakRateMultiplier: 7,
			}}
			account := &Account{ID: 3002, Platform: PlatformNovelAI, GroupRateMultiplier: &accountRate}
			rate := svc.ResolveNovelAINativeRateMultiplier(context.Background(), key, account)
			result := &OpenAIForwardResult{
				RequestID: fmt.Sprintf("native-quote-%g", quote), Model: "novelai/augment-image",
				NovelAINativeCostUSD: &quote, NovelAINativeRateMultiplier: &rate, Duration: time.Second,
			}
			reserved := quote * rate
			err := svc.RecordUsage(context.Background(), &OpenAIRecordUsageInput{
				Result: result, APIKey: key, User: key.User, Account: account,
				OriginalModel: result.Model, UpstreamEndpoint: "/ai/augment-image",
				PricingAt: time.Date(2026, 11, 16, 12, 0, 0, 0, time.UTC),
			})
			require.NoError(t, err)
			require.NotNil(t, usageRepo.lastLog)
			require.InDelta(t, quote, usageRepo.lastLog.TotalCost, 1e-12)
			require.InDelta(t, reserved, usageRepo.lastLog.ActualCost, 1e-12)
			require.InDelta(t, 0.8, usageRepo.lastLog.RateMultiplier, 1e-12)
			require.NotNil(t, usageRepo.lastLog.BillingMode)
			require.Equal(t, string(BillingModePerRequest), *usageRepo.lastLog.BillingMode)
			require.InDelta(t, reserved, userRepo.lastAmount, 1e-12)
			if quote == 0 {
				require.Zero(t, userRepo.deductCalls, "successful free tools log but never debit balance")
			} else {
				require.Equal(t, 1, userRepo.deductCalls)
			}
		})
	}
}

func TestNovelAINativeRateSnapshotSurvivesCacheExpiry(t *testing.T) {
	for _, admittedRate := range []float64{0, 0.4} {
		t.Run(fmt.Sprint(admittedRate), func(t *testing.T) {
			usageRepo := &openAIRecordUsageLogRepoStub{inserted: true}
			userRepo := &openAIRecordUsageUserRepoStub{}
			rateRepo := &userGroupRateResolverRepoStub{rate: &admittedRate}
			svc := newOpenAIRecordUsageServiceForTest(usageRepo, userRepo, &openAIRecordUsageSubRepoStub{}, rateRepo)
			groupID := int64(333)
			key := &APIKey{ID: 1002, UserID: 2002, User: &User{ID: 2002}, GroupID: &groupID,
				Group: &Group{ID: groupID, Platform: PlatformNovelAI, RateMultiplier: 1}}
			account := &Account{ID: 3002, Platform: PlatformNovelAI, GroupRateMultiplier: f64p(2)}
			quote := 0.95
			rate := svc.ResolveNovelAINativeRateMultiplier(context.Background(), key, account)
			reserved := quote * rate
			require.Equal(t, 1, rateRepo.calls)
			// Expire the actual cache entry without sleeping for its production
			// 30-second TTL, then simulate operator changes during forwarding.
			cacheKey := fmt.Sprintf("%d:%d", key.UserID, groupID)
			svc.userGroupRateResolver.cache.Set(cacheKey, admittedRate, time.Nanosecond)
			require.Eventually(t, func() bool { _, ok := svc.userGroupRateResolver.cache.Get(cacheKey); return !ok }, time.Second, time.Millisecond)
			rateRepo.rate = f64p(5)
			key.Group.RateMultiplier = 7
			account.GroupRateMultiplier = f64p(3)
			result := &OpenAIForwardResult{RequestID: "frozen-native-rate", Model: "novelai/augment-image",
				NovelAINativeCostUSD: &quote, NovelAINativeRateMultiplier: &rate}
			err := svc.RecordUsage(context.Background(), &OpenAIRecordUsageInput{
				Result: result, APIKey: key, User: key.User, Account: account, OriginalModel: result.Model,
			})
			require.NoError(t, err)
			require.Equal(t, 1, rateRepo.calls, "settlement must not resolve the expired rate again")
			require.InDelta(t, reserved, userRepo.lastAmount, 1e-12)
			require.NotNil(t, usageRepo.lastLog)
			require.InDelta(t, quote, usageRepo.lastLog.TotalCost, 1e-12)
			require.InDelta(t, reserved, usageRepo.lastLog.ActualCost, 1e-12)
			require.InDelta(t, rate, usageRepo.lastLog.RateMultiplier, 1e-12)
		})
	}
}

func TestNovelAINativeSettlementRequiresValidRateSnapshot(t *testing.T) {
	for _, rate := range []*float64{nil, f64p(-1), f64p(math.NaN()), f64p(math.Inf(1))} {
		result := &OpenAIForwardResult{NovelAINativeCostUSD: f64p(0.02), NovelAINativeRateMultiplier: rate}
		cost, err := (&OpenAIGatewayService{}).calculateOpenAIRecordUsageCost(context.Background(), result, nil, nil,
			1, 1, 1, 1, UsageTokens{}, "", nil, false, time.Time{})
		require.ErrorContains(t, err, "rate multiplier")
		require.Nil(t, cost, "missing snapshots must not silently resolve newer prices")
	}
}

func TestNovelAINativeCostRejectsInvalidQuotes(t *testing.T) {
	for _, quote := range []float64{-1, math.NaN(), math.Inf(1), math.Inf(-1)} {
		cost, err := calculateNovelAINativeCost(quote, 1)
		require.Error(t, err)
		require.Nil(t, cost)
	}
	for _, rate := range []float64{math.NaN(), math.Inf(1), math.Inf(-1)} {
		cost, err := calculateNovelAINativeCost(0.02, rate)
		require.Error(t, err)
		require.Nil(t, cost)
	}
	cost, err := calculateNovelAINativeCost(math.MaxFloat64, 2)
	require.Error(t, err)
	require.Nil(t, cost)
	cost, err = calculateNovelAINativeCost(0.02, -1)
	require.NoError(t, err)
	require.Zero(t, cost.ActualCost)
	require.Equal(t, 0.02, cost.TotalCost)
}

func TestNovelAINativeNilQuotePreservesGenerationReferencePrices(t *testing.T) {
	for _, tc := range []struct {
		model string
		body  float64
		ref   float64
	}{
		{"nai-diffusion-4-5-full", 0.001, 0.05},
		{"nai-diffusion-5-full", 0.035, 0.075},
	} {
		svc := &OpenAIGatewayService{billingService: NewBillingService(&config.Config{}, nil)}
		result := &OpenAIForwardResult{
			Model: tc.model, ImageCount: 2, ImageSize: ImageBillingSize1K, ReferenceImageCount: 3,
		}
		key := &APIKey{Group: &Group{Platform: PlatformNovelAI}}
		cost, err := svc.calculateOpenAIRecordUsageCost(context.Background(), result, key, []string{tc.model},
			7, 0.5, 11, 13, UsageTokens{}, "", nil, false, time.Time{})
		require.NoError(t, err)
		want := 2*tc.body + 3*tc.ref
		require.InDelta(t, want, cost.TotalCost, 1e-12)
		require.InDelta(t, want*0.5, cost.ActualCost, 1e-12, "generation still uses its own image multiplier")
	}
}
