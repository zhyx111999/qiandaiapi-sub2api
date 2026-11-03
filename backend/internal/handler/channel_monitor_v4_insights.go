package handler

import (
	"github.com/Wei-Shaw/sub2api/internal/pkg/response"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

// V4Insights returns the real-traffic samples of the v4 cards, limited to the
// signed-in user's available groups. GET /api/v1/channel-monitor-v4/insights?group_id=1&group_id=2
func (h *ChannelMonitorV2Handler) V4Insights(c *gin.Context) { h.v4Insights(c, false) }

// AdminV4Insights is the unscoped admin variant. GET /api/v1/admin/channel-monitor-v4/insights
func (h *ChannelMonitorV2Handler) AdminV4Insights(c *gin.Context) { h.v4Insights(c, true) }

func (h *ChannelMonitorV2Handler) v4Insights(c *gin.Context, admin bool) {
	groupIDs, err := parseChannelMonitorV2GroupIDs(queryList(c, "group_id"))
	if err != nil {
		response.BadRequest(c, "invalid group_id")
		return
	}
	filter := service.ChannelMonitorV2Filter{GroupIDs: groupIDs}
	if !h.scopeFilter(c, &filter, admin) {
		return
	}
	insights, err := h.service.V4GroupInsights(c.Request.Context(), filter)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, gin.H{"items": insights})
}
