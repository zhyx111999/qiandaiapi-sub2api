package handler

import (
	"context"

	"github.com/Wei-Shaw/sub2api/internal/pkg/response"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

type channelMonitorViewStore interface {
	ChannelMonitorView(ctx context.Context) (service.ChannelMonitorView, error)
	SetChannelMonitorView(ctx context.Context, view string) (service.ChannelMonitorView, error)
}

// ChannelMonitorV4Handler tells the console which monitor view the site shows
// (v1, v2, v3 or the v4 overlay) and lets an admin switch it.
type ChannelMonitorV4Handler struct {
	views channelMonitorViewStore
}

func NewChannelMonitorV4Handler(settingService *service.SettingService) *ChannelMonitorV4Handler {
	return &ChannelMonitorV4Handler{views: settingService}
}

// View returns the current view. GET /api/v1/channel-monitor-v4/view
func (h *ChannelMonitorV4Handler) View(c *gin.Context) {
	view, err := h.views.ChannelMonitorView(c.Request.Context())
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, view)
}

// SetView switches the view. PUT /api/v1/admin/channel-monitor-v4/view
func (h *ChannelMonitorV4Handler) SetView(c *gin.Context) {
	var input struct {
		View string `json:"view"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		response.BadRequest(c, "invalid view")
		return
	}
	view, err := h.views.SetChannelMonitorView(c.Request.Context(), input.View)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, view)
}
