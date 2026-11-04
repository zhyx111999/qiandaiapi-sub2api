package routes

import (
	"github.com/Wei-Shaw/sub2api/internal/handler"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

// registerChannelMonitorV4UserRoutes serves the v4 card insights of the user's own groups. v4 runs
// on the v2 engine, so the v2 read guards apply.
func registerChannelMonitorV4UserRoutes(authenticated *gin.RouterGroup, h *handler.Handlers, settingService *service.SettingService, panelRateLimiter *middleware.PanelRateLimiter) {
	authenticated.GET("/channel-monitor-v4/insights", panelRateLimiter.Heavy(), channelMonitorModeV2Guard(settingService), h.ChannelMonitorV2.V4Insights)
}

// registerChannelMonitorV4AdminRoutes serves the unscoped v4 card insights to admins.
func registerChannelMonitorV4AdminRoutes(admin *gin.RouterGroup, h *handler.Handlers, settingService *service.SettingService) {
	admin.GET("/channel-monitor-v4/insights", channelMonitorModeV2Guard(settingService), h.ChannelMonitorV2.AdminV4Insights)
}
