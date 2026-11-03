package service

import (
	"context"
	"time"

	infraerrors "github.com/Wei-Shaw/sub2api/internal/pkg/errors"
)

// Real-traffic side of a v4 card: the newest first-token samples of each group
// and its cache rate over the last 30 minutes. Probe health stays on the v2 matrix.
const (
	channelMonitorV4FirstTokenSamples = 30
	channelMonitorV4SampleWindow      = 24 * time.Hour
	channelMonitorV4CacheWindow       = 30 * time.Minute
	channelMonitorV4MaxGroups         = 200
)

// ChannelMonitorV4RequestSample is one successful request with a recorded first
// token. The extra fields let the console apply the usage table's output-rate rule.
type ChannelMonitorV4RequestSample struct {
	At                time.Time `json:"at"`
	FirstTokenMs      int       `json:"first_token_ms"`
	DurationMs        *int      `json:"duration_ms"`
	OutputTokens      int       `json:"output_tokens"`
	ImageCount        int       `json:"image_count"`
	ImageOutputTokens int       `json:"image_output_tokens"`
	BillingMode       *string   `json:"billing_mode"`
}

// ChannelMonitorV4CacheTotals are the v2 rollup token sums of one group.
type ChannelMonitorV4CacheTotals struct {
	Input         int64
	CacheCreation int64
	CacheRead     int64
}

type ChannelMonitorV4GroupInsight struct {
	GroupID int64 `json:"group_id"`
	// Samples are newest first.
	Samples []ChannelMonitorV4RequestSample `json:"samples"`
	// CacheRate uses the v2 definition: read / (input + creation + read); nil without input.
	CacheRate *float64 `json:"cache_rate"`
}

// ChannelMonitorV4InsightReader is implemented by the v2 monitor repository.
type ChannelMonitorV4InsightReader interface {
	ChannelMonitorV4RecentRequests(ctx context.Context, groupIDs []int64, since time.Time, perGroup int) (map[int64][]ChannelMonitorV4RequestSample, error)
	ChannelMonitorV4CacheTotals(ctx context.Context, groupIDs []int64, since time.Time) (map[int64]ChannelMonitorV4CacheTotals, error)
}

var errChannelMonitorV4TooManyGroups = infraerrors.BadRequest("CHANNEL_MONITOR_V4_TOO_MANY_GROUPS", "too many groups")

// V4GroupInsights returns insights for the requested groups, limited to the
// viewer's allowed groups when filter.RestrictGroups is set.
func (s *ChannelMonitorV2Service) V4GroupInsights(ctx context.Context, filter ChannelMonitorV2Filter) ([]ChannelMonitorV4GroupInsight, error) {
	if _, err := s.getEnabledConfig(ctx); err != nil {
		return nil, err
	}
	groupIDs := filter.GroupIDs
	if filter.RestrictGroups {
		allowed := make(map[int64]bool, len(filter.AllowedGroupIDs))
		for _, id := range filter.AllowedGroupIDs {
			allowed[id] = true
		}
		groupIDs = make([]int64, 0, len(filter.GroupIDs))
		for _, id := range filter.GroupIDs {
			if allowed[id] {
				groupIDs = append(groupIDs, id)
			}
		}
	}
	if len(groupIDs) > channelMonitorV4MaxGroups {
		return nil, errChannelMonitorV4TooManyGroups
	}
	insights := make([]ChannelMonitorV4GroupInsight, 0, len(groupIDs))
	if len(groupIDs) == 0 {
		return insights, nil
	}
	reader, ok := s.repo.(ChannelMonitorV4InsightReader)
	if !ok {
		return nil, infraerrors.ServiceUnavailable("CHANNEL_MONITOR_V4_UNAVAILABLE", "channel monitor v4 insights are unavailable")
	}
	now := time.Now()
	samples, err := reader.ChannelMonitorV4RecentRequests(ctx, groupIDs, now.Add(-channelMonitorV4SampleWindow), channelMonitorV4FirstTokenSamples)
	if err != nil {
		return nil, err
	}
	totals, err := reader.ChannelMonitorV4CacheTotals(ctx, groupIDs, now.Add(-channelMonitorV4CacheWindow))
	if err != nil {
		return nil, err
	}
	for _, id := range groupIDs {
		insight := ChannelMonitorV4GroupInsight{GroupID: id, Samples: samples[id]}
		if insight.Samples == nil {
			insight.Samples = []ChannelMonitorV4RequestSample{}
		}
		if t := totals[id]; t.Input+t.CacheCreation+t.CacheRead > 0 {
			rate := float64(t.CacheRead) / float64(t.Input+t.CacheCreation+t.CacheRead)
			insight.CacheRate = &rate
		}
		insights = append(insights, insight)
	}
	return insights, nil
}
