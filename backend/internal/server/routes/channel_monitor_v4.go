package routes

import (
	"github.com/Wei-Shaw/sub2api/internal/handler"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

// registerChannelMonitorV4UserRoutes lets every signed-in user ask which monitor
// view the site shows, so the console can pick the matching page. The card
// insights follow the v2 read guards: the v4 overlay runs on the v2 engine.
func registerChannelMonitorV4UserRoutes(authenticated *gin.RouterGroup, h *handler.Handlers, settingService *service.SettingService, panelRateLimiter *middleware.PanelRateLimiter) {
	authenticated.GET("/channel-monitor-v4/view", handler.NewChannelMonitorV4Handler(settingService).View)
	authenticated.GET("/channel-monitor-v4/insights", panelRateLimiter.Heavy(), channelMonitorModeV2Guard(settingService), h.ChannelMonitorV2.V4Insights)
}

// registerChannelMonitorV4AdminRoutes switches the view like the official
// PUT /admin/channel-monitor-mode, which stays registered and unchanged.
func registerChannelMonitorV4AdminRoutes(admin *gin.RouterGroup, h *handler.Handlers, settingService *service.SettingService) {
	admin.PUT("/channel-monitor-v4/view", handler.NewChannelMonitorV4Handler(settingService).SetView)
	admin.GET("/channel-monitor-v4/insights", channelMonitorModeV2Guard(settingService), h.ChannelMonitorV2.AdminV4Insights)
}
