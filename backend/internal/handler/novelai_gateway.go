package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	pkghttputil "github.com/Wei-Shaw/sub2api/internal/pkg/httputil"
	"github.com/Wei-Shaw/sub2api/internal/pkg/ip"
	"github.com/Wei-Shaw/sub2api/internal/pkg/logger"
	middleware2 "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// NovelAI relays NovelAI image requests (OpenAI-compatible Images and the native
// /ai/generate-image, /ai/generate-image-stream, /ai/encode-vibe) for NovelAI groups. It follows
// the stock Images flow: the group's image permission, the prompt audit, user / image / account slots, the balance
// hold, account failover on retryable upstream errors, and the stock image billing, priced by the
// request's total pixels and its reference images.
func (h *OpenAIGatewayHandler) NovelAI(c *gin.Context) {
	streamStarted := false
	defer h.recoverResponsesPanic(c, &streamStarted)
	requestStart := time.Now()

	apiKey, ok := middleware2.GetAPIKeyFromContext(c)
	if !ok {
		h.errorResponse(c, http.StatusUnauthorized, "authentication_error", "Invalid API key")
		return
	}
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		h.errorResponse(c, http.StatusInternalServerError, "api_error", "User context not found")
		return
	}
	reqLog := requestLogger(c, "handler.novelai",
		zap.Int64("user_id", subject.UserID), zap.Int64("api_key_id", apiKey.ID), zap.Any("group_id", apiKey.GroupID))
	if !h.ensureResponsesDependencies(c, reqLog) {
		return
	}

	body, err := pkghttputil.ReadRequestBodyWithPrealloc(c.Request)
	if err != nil {
		if maxErr, ok := extractMaxBytesError(err); ok {
			h.errorResponse(c, http.StatusRequestEntityTooLarge, "invalid_request_error", buildBodyTooLargeMessage(maxErr.Limit))
			return
		}
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Failed to read request body")
		return
	}
	if !service.GroupAllowsImageGeneration(apiKey.Group) {
		h.errorResponse(c, http.StatusForbidden, "permission_error", service.ImageGenerationPermissionMessage())
		return
	}
	req, err := service.ParseNovelAIRequest(c.Request.URL.Path, c.GetHeader("Content-Type"), body)
	if err != nil {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", err.Error())
		return
	}
	ensureCompositeTargetPlatform(c, apiKey, req.Model)
	if !compositeTargetPlatformAllowed(c, apiKey, req.Model, service.PlatformNovelAI) {
		h.errorResponse(c, http.StatusNotFound, "not_found_error", "This endpoint requires a NovelAI model")
		return
	}
	reqLog = reqLog.With(zap.String("model", req.Model), zap.String("operation", string(req.Operation)), zap.Bool("stream", req.Stream))

	requireAPIKeyQueueCapability(c, service.APIKeyQueueCapabilityImageGeneration)
	if req.Operation != service.NovelAIEncodeVibe {
		if decision := h.checkSecurityAudit(c, reqLog, apiKey, subject, service.ContentModerationProtocolOpenAIImages, req.Model, req.ModerationBody()); decision != nil && !decision.AllowNextStage {
			h.openAISecurityAuditError(c, decision)
			return
		}
	}
	imageRelease, acquired := h.acquireImageGenerationSlot(c, streamStarted)
	if !acquired {
		return
	}
	if imageRelease != nil {
		defer imageRelease()
	}
	setOpsRequestContext(c, req.Model, req.Stream)
	setOpsEndpointContext(c, "", int16(service.RequestTypeFromLegacy(req.Stream, false)))

	channelMapping, _ := h.gatewayService.ResolveChannelMappingAndRestrict(c.Request.Context(), apiKey.GroupID, req.Model)
	if h.errorPassthroughService != nil {
		service.BindErrorPassthroughService(c, h.errorPassthroughService)
	}
	subscription, _ := middleware2.GetSubscriptionFromContext(c)
	service.SetOpsLatencyMs(c, service.OpsAuthLatencyMsKey, time.Since(requestStart).Milliseconds())
	routingStart := time.Now()

	userRelease, acquired := h.acquireResponsesUserSlot(c, subject.UserID, subject.Concurrency, apiKey.ID, apiKey.ConcurrencyLimit, req.Stream, &streamStarted, reqLog)
	if !acquired {
		return
	}
	if userRelease != nil {
		defer userRelease()
	}
	if err := h.billingCacheService.CheckBillingEligibility(c.Request.Context(), apiKey.User, apiKey, apiKey.Group, subscription, service.QuotaPlatform(c.Request.Context(), apiKey)); err != nil {
		h.novelAIBillingError(c, err, streamStarted)
		return
	}
	inflightDone, inflightErr := reserveInflightBalance(c, h.billingCacheService, h.gatewayService, apiKey, subscription,
		service.InflightEstimateRequest{Model: req.Model, BodyBytes: len(body), Kind: service.InflightEstimateImage, Units: req.Samples})
	if inflightErr != nil {
		h.novelAIBillingError(c, inflightErr, streamStarted)
		return
	}
	defer inflightDone()

	sessionHash := h.gatewayService.GenerateExplicitSessionHash(c, body)
	failedAccountIDs := make(map[int64]struct{})
	sameAccountRetryCount := make(map[int64]int)
	switchCount, profitVetoCount := 0, 0
	var lastFailoverErr *service.UpstreamFailoverError

	for {
		selection, _, err := h.gatewayService.SelectAccountWithSchedulerForCapability(c.Request.Context(), apiKey.GroupID, "",
			sessionHash, req.Model, failedAccountIDs, service.OpenAIUpstreamTransportAny,
			service.OpenAIEndpointCapabilityChatCompletions, false, false, false, service.PlatformNovelAI)
		if err != nil || selection == nil || selection.Account == nil {
			if failoverClientGone(c) {
				return
			}
			if lastFailoverErr != nil {
				h.handleFailoverExhausted(c, lastFailoverErr, streamStarted)
				return
			}
			cls := classifyNoAccountErrorFromGin(c, h.gatewayService, apiKey, req.Model, req.Model, service.PlatformNovelAI)
			markOpsRoutingCapacityLimitedIfNoAvailable(c, err)
			h.handleStreamingAwareError(c, cls.Status, cls.ErrType, cls.Message, streamStarted)
			return
		}
		account := selection.Account
		setOpsSelectedAccount(c, account.ID, account.Platform)
		accountRelease, slot := h.acquireResponsesAccountSlot(c, apiKey.GroupID, sessionHash, selection, req.Stream, &streamStarted, reqLog)
		if slot == openAISlotAcquireProfitVetoed {
			if !recordOpenAIProfitVeto(failedAccountIDs, account.ID, &profitVetoCount) {
				h.handleOpenAIProfitVetoExhausted(c, streamStarted, reqLog, profitVetoCount)
				return
			}
			continue
		}
		if slot != openAISlotAcquireOK {
			return
		}
		service.SetOpsLatencyMs(c, service.OpsRoutingLatencyMsKey, time.Since(routingStart).Milliseconds())

		writtenBefore := c.Writer.Size()
		result, err := func() (*service.OpenAIForwardResult, error) {
			if accountRelease != nil {
				defer accountRelease()
			}
			return h.gatewayService.ForwardNovelAI(c.Request.Context(), c, account, req)
		}()
		if err != nil && (result == nil || result.ImageCount == 0) {
			var failoverErr *service.UpstreamFailoverError
			if errors.As(err, &failoverErr) && c.Writer.Size() == writtenBefore {
				h.gatewayService.ReportOpenAIAccountScheduleResult(account, req.Model, false, nil, err)
				if failoverClientGone(c) {
					return
				}
				if failoverErr.RetryableOnSameAccount {
					limit := effectiveSameAccountRetryLimit(failoverErr, account)
					if sameAccountRetryAllowed(failoverErr, sameAccountRetryCount[account.ID], limit) {
						sameAccountRetryCount[account.ID]++
						select {
						case <-c.Request.Context().Done():
							return
						case <-time.After(sameAccountRetryDelayFor(failoverErr, sameAccountRetryCount[account.ID])):
						}
						continue
					}
				}
				h.gatewayService.RecordOpenAIAccountSwitch()
				failedAccountIDs[account.ID] = struct{}{}
				lastFailoverErr = failoverErr
				if switchCount >= h.maxAccountSwitches {
					h.handleFailoverExhausted(c, failoverErr, streamStarted)
					return
				}
				switchCount++
				reqLog.Warn("novelai.upstream_failover_switching", zap.Int64("account_id", account.ID),
					zap.Int("upstream_status", failoverErr.StatusCode), zap.Int("switch_count", switchCount))
				continue
			}
			h.gatewayService.ReportOpenAIAccountScheduleResult(account, req.Model, false, nil, err)
			if !openAIForwardErrorAlreadyCommunicated(c, writtenBefore, err) {
				h.ensureForwardErrorResponse(c, streamStarted)
			}
			reqLog.Warn("novelai.forward_failed", zap.Int64("account_id", account.ID), zap.Error(err))
			return
		}
		if err != nil {
			reqLog.Warn("novelai.forward_partial_error_with_image_result", zap.Int64("account_id", account.ID), zap.Error(err))
		}
		var firstTokenMs *int
		if result != nil {
			firstTokenMs = result.FirstTokenMs
		}
		h.gatewayService.ReportOpenAIAccountScheduleResult(account, req.Model, true, firstTokenMs)
		h.recordNovelAIUsage(c, apiKey, subscription, account, result, body, channelMapping, req.Model)
		return
	}
}

func (h *OpenAIGatewayHandler) recordNovelAIUsage(c *gin.Context, apiKey *service.APIKey, subscription *service.UserSubscription,
	account *service.Account, result *service.OpenAIForwardResult, body []byte, channelMapping service.ChannelMappingResult, model string) {
	if result == nil {
		return
	}
	userAgent, clientIP := c.GetHeader("User-Agent"), ip.GetClientIP(c)
	inboundEndpoint, upstreamEndpoint := GetInboundEndpoint(c), GetUpstreamEndpoint(c, account.Platform)
	quotaPlatform := service.QuotaPlatform(c.Request.Context(), apiKey)
	sessionID := service.ExtractClientSessionID(c)
	usageFields := clientRequestedUsageFields(c, channelMapping, model, result.UpstreamModel)
	payloadHash := service.HashUsageRequestPayload(body)
	h.submitMandatoryUsageRecordTask(c.Request.Context(), func(ctx context.Context) {
		if err := h.gatewayService.RecordUsage(ctx, &service.OpenAIRecordUsageInput{
			Result: result, APIKey: apiKey, User: apiKey.User, Account: account, Subscription: subscription,
			InboundEndpoint: inboundEndpoint, UpstreamEndpoint: upstreamEndpoint, UserAgent: userAgent,
			IPAddress: clientIP, RequestPayloadHash: payloadHash, APIKeyService: h.apiKeyService,
			QuotaPlatform: quotaPlatform, SessionID: sessionID, ChannelUsageFields: usageFields,
		}); err != nil {
			logger.L().Error("novelai.record_usage_failed", zap.Int64("api_key_id", apiKey.ID),
				zap.Int64("account_id", account.ID), zap.String("model", model), zap.Error(err))
		}
	})
}

func (h *OpenAIGatewayHandler) novelAIBillingError(c *gin.Context, err error, streamStarted bool) {
	status, code, message, retryAfter := billingErrorDetails(err)
	if retryAfter > 0 {
		c.Header("Retry-After", strconv.Itoa(retryAfter))
	}
	h.handleStreamingAwareError(c, status, code, message, streamStarted)
}
