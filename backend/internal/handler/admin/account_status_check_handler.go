package admin

import (
	"strconv"
	"strings"

	infraerrors "github.com/Wei-Shaw/sub2api/internal/pkg/errors"
	"github.com/Wei-Shaw/sub2api/internal/pkg/response"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

// 独立状态检测接口：配置、批量状态与立即执行；只使用原有管理员权限。
type AccountStatusCheckHandler struct {
	svc *service.AccountStatusCheckService
}

func NewAccountStatusCheckHandler(svc *service.AccountStatusCheckService) *AccountStatusCheckHandler {
	return &AccountStatusCheckHandler{svc: svc}
}

var errAccountStatusCheckRequest = infraerrors.BadRequest("ACCOUNT_STATUS_CHECK_INVALID", "invalid account status check request")

// Capabilities GET /admin/account-status-check/capabilities
func (h *AccountStatusCheckHandler) Capabilities(c *gin.Context) {
	response.Success(c, service.AccountStatusCheckCapabilitiesView())
}

// Get GET /admin/account-status-check/accounts/:id
func (h *AccountStatusCheckHandler) Get(c *gin.Context) {
	id, ok := accountStatusCheckAccountID(c)
	if !ok {
		return
	}
	view, err := h.svc.Get(c.Request.Context(), id)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, view)
}

// Update PUT /admin/account-status-check/accounts/:id
func (h *AccountStatusCheckHandler) Update(c *gin.Context) {
	id, ok := accountStatusCheckAccountID(c)
	if !ok {
		return
	}
	var in service.AccountStatusCheckInput
	if err := c.ShouldBindJSON(&in); err != nil {
		response.ErrorFrom(c, errAccountStatusCheckRequest)
		return
	}
	view, err := h.svc.Update(c.Request.Context(), id, in)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, view)
}

// Status GET /admin/account-status-check/status?account_ids=1,2,3
func (h *AccountStatusCheckHandler) Status(c *gin.Context) {
	var ids []int64
	for _, raw := range strings.Split(strings.Join(c.QueryArray("account_ids"), ","), ",") {
		if raw = strings.TrimSpace(raw); raw == "" {
			continue
		}
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || id <= 0 {
			response.ErrorFrom(c, errAccountStatusCheckRequest)
			return
		}
		ids = append(ids, id)
	}
	items, err := h.svc.Status(c.Request.Context(), ids)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, gin.H{"items": items})
}

// Run POST /admin/account-status-check/accounts/:id/run
func (h *AccountStatusCheckHandler) Run(c *gin.Context) {
	id, ok := accountStatusCheckAccountID(c)
	if !ok {
		return
	}
	if err := h.svc.Run(c.Request.Context(), id); err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, gin.H{"started": true})
}

func accountStatusCheckAccountID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		response.ErrorFrom(c, errAccountStatusCheckRequest)
		return 0, false
	}
	return id, true
}
