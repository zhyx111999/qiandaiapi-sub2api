package routes

import (
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/Wei-Shaw/sub2api/internal/handler"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestChannelMonitorV4RoutesServeCardInsights(t *testing.T) {
	gin.SetMode(gin.TestMode)
	settings := service.NewSettingService(&channelMonitorRouteSettingRepoStub{values: map[string]string{
		service.SettingKeyChannelMonitorMode: service.ChannelMonitorModeV4,
	}}, &config.Config{})
	router := gin.New()
	h := &handler.Handlers{}
	registerChannelMonitorV4UserRoutes(router.Group("/api/v1"), h, settings, nil)
	registerChannelMonitorV4AdminRoutes(router.Group("/api/v1/admin"), h, settings)

	registered := map[string]bool{}
	for _, r := range router.Routes() {
		registered[r.Method+" "+r.Path] = true
	}
	require.True(t, registered["GET /api/v1/channel-monitor-v4/insights"], "users read card insights of their own groups")
	require.True(t, registered["GET /api/v1/admin/channel-monitor-v4/insights"], "admins read unscoped card insights")
	require.Len(t, registered, 2, "the mode itself is switched by the official channel-monitor-mode route")
}
