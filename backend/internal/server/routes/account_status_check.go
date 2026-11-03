package routes

import (
	"github.com/Wei-Shaw/sub2api/internal/handler"
	"github.com/gin-gonic/gin"
)

// registerAccountStatusCheckRoutes mounts the account status check module on the admin group, after
// the admin, observer, compliance and scoped-key guards. The routes are not in the scoped admin key
// catalog or the observer allowlist, so only full administrators reach them.
func registerAccountStatusCheckRoutes(admin *gin.RouterGroup, h *handler.Handlers) {
	group := admin.Group("/account-status-check")
	group.GET("/capabilities", h.Admin.AccountStatusCheck.Capabilities)
	group.GET("/status", h.Admin.AccountStatusCheck.Status)
	group.GET("/accounts/:id", h.Admin.AccountStatusCheck.Get)
	group.PUT("/accounts/:id", h.Admin.AccountStatusCheck.Update)
	group.POST("/accounts/:id/run", h.Admin.AccountStatusCheck.Run)
}
