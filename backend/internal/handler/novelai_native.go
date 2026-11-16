package handler

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/pkg/ctxkey"
	middleware2 "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

// NovelAISubscription is a client compatibility view, not the upstream account's
// balance. Authentication and key/group policy remain the gateway middleware's job.
func (h *OpenAIGatewayHandler) NovelAISubscription(c *gin.Context) {
	if _, ok := middleware2.GetAPIKeyFromContext(c); !ok {
		h.errorResponse(c, http.StatusUnauthorized, "authentication_error", "Invalid API key")
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"tier": 3, "active": true, "expiresAt": int64(4102444800),
		"trainingStepsLeft": gin.H{"fixedTrainingStepsLeft": 10000, "purchasedTrainingSteps": 0},
		"usage":             gin.H{"percent": 100, "purchasedPercent": 0, "isNegative": false, "timeUntilNextPercent": 60},
	})
}

// NovelAISuggestTags uses read-only account selection: no image/user/account
// generation slot, balance reservation or usage charge is needed for completion.
func (h *OpenAIGatewayHandler) NovelAISuggestTags(c *gin.Context) {
	apiKey, ok := middleware2.GetAPIKeyFromContext(c)
	if !ok {
		h.errorResponse(c, http.StatusUnauthorized, "authentication_error", "Invalid API key")
		return
	}
	if h.gatewayService == nil {
		h.errorResponse(c, http.StatusServiceUnavailable, "api_error", "Gateway service unavailable")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 4500*time.Millisecond)
	defer cancel()
	c.Request = c.Request.WithContext(ctx)
	bindNovelAINativePlatform(c, apiKey)
	account, err := h.gatewayService.SelectAccountForTokenCount(c.Request.Context(), apiKey.GroupID, "", "",
		service.OpenAIEndpointCapabilityChatCompletions, service.PlatformNovelAI)
	if err != nil || account == nil {
		h.errorResponse(c, http.StatusServiceUnavailable, "api_error", "No available NovelAI accounts")
		return
	}
	setOpsSelectedAccount(c, account.ID, account.Platform)
	setOpsRequestContext(c, c.Query("model"), false)
	req := &service.NovelAIRequest{
		Operation: service.NovelAISuggestTags, Endpoint: "/ai/generate-image/suggest-tags", Model: c.Query("model"),
	}
	if _, err := h.gatewayService.ForwardNovelAI(c.Request.Context(), c, account, req); err != nil && !c.Writer.Written() {
		h.errorResponse(c, http.StatusBadGateway, "api_error", "NovelAI tag completion unavailable")
	}
}

// Native tools are a NovelAI capability, not a model-discovery request. A bad
// model still belongs to this endpoint and is validated by the upstream provider.
func bindNovelAINativePlatform(c *gin.Context, apiKey *service.APIKey) {
	if apiKey.Group != nil && apiKey.Group.Platform == service.PlatformComposite {
		ctx := service.WithResolvedTargetPlatform(c.Request.Context(), service.PlatformNovelAI)
		// Keep the public alias for authorization/logging, but not a model-owned
		// account restriction: native tools select a provider capability.
		ctx = context.WithValue(ctx, ctxkey.CompositeRouteSource, "")
		c.Request = c.Request.WithContext(ctx)
	}
}

// Native multipart stores model inside its request part, outside the generic
// middleware parser. Capability selection must not bypass explicit model policy.
func (h *OpenAIGatewayHandler) allowNovelAINativeModel(c *gin.Context, apiKey *service.APIKey, req *service.NovelAIRequest) bool {
	model := req.Model
	if req.Operation == service.NovelAIAugmentImage {
		model = req.RequestedModel
	}
	model = clientRequestedModel(c, model)
	if model == "" {
		return true
	}
	models := []string{model}
	message := ""
	if apiKey.Group != nil && apiKey.Group.ModelAllowlistEnabled() && !apiKey.Group.ModelAllowlist.Allows(model) {
		message = fmt.Sprintf("Model %q is not available for this group", model)
	} else if service.FirstUserGroupDeniedModel(apiKey.DeniedModelsInGroup(), models) != "" {
		message = fmt.Sprintf("Model %q is not available for your account in this group", model)
	}
	if message != "" {
		service.MarkOpsClientBusinessLimited(c, service.OpsClientBusinessLimitedReasonLocalModelConfiguration)
		middleware2.MarkIngressRejected(c, middleware2.IngressRejectModelNotAllowed)
		h.errorResponse(c, http.StatusNotFound, "not_found_error", message)
		return false
	}
	permissions := service.APIKeyQueueRequestPermissionsFromContext(c.Request.Context())
	permissions.Models = append(permissions.Models, model)
	c.Request = c.Request.WithContext(service.WithAPIKeyQueueRequestPermissions(c.Request.Context(), permissions))
	return true
}

func (h *OpenAIGatewayHandler) reserveNovelAINativeCharge(c *gin.Context, apiKey *service.APIKey,
	subscription *service.UserSubscription, account *service.Account, req *service.NovelAIRequest) (func(), error) {
	if req.NativeCostUSD == nil {
		return inflightNoop, service.ErrBillingServiceUnavailable
	}
	ctx := c.Request.Context()
	rate := h.gatewayService.ResolveNovelAINativeRateMultiplier(ctx, apiKey, account)
	amount := *req.NativeCostUSD * rate
	if rate < 0 || math.IsNaN(rate) || math.IsInf(rate, 0) || amount < 0 || math.IsNaN(amount) || math.IsInf(amount, 0) {
		return inflightNoop, service.ErrBillingServiceUnavailable
	}
	req.NativeRateMultiplier = &rate
	res, err := h.billingCacheService.ReserveFixedCharge(ctx, apiKey.User, apiKey, apiKey.Group, subscription, amount)
	if err != nil {
		return inflightNoop, err
	}
	if res == nil {
		return inflightNoop, nil
	}
	c.Request = c.Request.WithContext(service.WithInflightReservation(ctx, res))
	return res.HandlerDone, nil
}
