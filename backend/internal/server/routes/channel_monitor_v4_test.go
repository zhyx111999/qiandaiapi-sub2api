package routes

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/Wei-Shaw/sub2api/internal/handler"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestChannelMonitorV4RoutesServeTheView(t *testing.T) {
	gin.SetMode(gin.TestMode)
	settings := service.NewSettingService(&channelMonitorRouteSettingRepoStub{values: map[string]string{
		service.SettingKeyChannelMonitorMode:        service.ChannelMonitorModeV1,
		service.SettingKeyChannelMonitorV4Selection: "v4:v1",
	}}, &config.Config{})
	router := gin.New()
	h := &handler.Handlers{}
	registerChannelMonitorV4UserRoutes(router.Group("/api/v1"), h, settings, nil)
	registerChannelMonitorV4AdminRoutes(router.Group("/api/v1/admin"), h, settings)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/channel-monitor-v4/view", nil))
	require.Equal(t, http.StatusOK, rec.Code)
	require.JSONEq(t, `{"code":0,"message":"success","data":{"view":"v4"}}`, rec.Body.String())

	registered := map[string]bool{}
	for _, r := range router.Routes() {
		registered[r.Method+" "+r.Path] = true
	}
	require.True(t, registered["PUT /api/v1/admin/channel-monitor-v4/view"], "switching is an admin route")
	require.False(t, registered["PUT /api/v1/channel-monitor-v4/view"], "users can only read the view")
	require.True(t, registered["GET /api/v1/channel-monitor-v4/insights"], "users read card insights of their own groups")
	require.True(t, registered["GET /api/v1/admin/channel-monitor-v4/insights"], "admins read unscoped card insights")
}
