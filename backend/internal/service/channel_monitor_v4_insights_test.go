package service

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type channelMonitorV4InsightRepoStub struct {
	channelMonitorV2RepoStub
	samples map[int64][]ChannelMonitorV4RequestSample
	totals  map[int64]ChannelMonitorV4CacheTotals
	asked   []int64
}

func (s *channelMonitorV4InsightRepoStub) ChannelMonitorV4RecentRequests(_ context.Context, groupIDs []int64, since time.Time, perGroup int) (map[int64][]ChannelMonitorV4RequestSample, error) {
	s.asked = append([]int64(nil), groupIDs...)
	if time.Since(since) < 23*time.Hour || perGroup != channelMonitorV4FirstTokenSamples {
		panic("unexpected sample window")
	}
	return s.samples, nil
}

func (s *channelMonitorV4InsightRepoStub) ChannelMonitorV4CacheTotals(_ context.Context, _ []int64, since time.Time) (map[int64]ChannelMonitorV4CacheTotals, error) {
	if d := time.Since(since); d < 29*time.Minute || d > 31*time.Minute {
		panic("unexpected cache window")
	}
	return s.totals, nil
}

func newChannelMonitorV4InsightFixture(t *testing.T) (*ChannelMonitorV2Service, *channelMonitorV4InsightRepoStub) {
	t.Helper()
	at := time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC)
	duration := 3000
	repo := &channelMonitorV4InsightRepoStub{
		channelMonitorV2RepoStub: channelMonitorV2RepoStub{config: ChannelMonitorV2Config{Enabled: true}},
		samples: map[int64][]ChannelMonitorV4RequestSample{
			1: {{At: at, FirstTokenMs: 1200, DurationMs: &duration, OutputTokens: 90}},
		},
		totals: map[int64]ChannelMonitorV4CacheTotals{1: {Input: 100, CacheCreation: 50, CacheRead: 850}},
	}
	return NewChannelMonitorV2Service(repo), repo
}

func TestChannelMonitorV4InsightsScopeAndCacheRate(t *testing.T) {
	svc, repo := newChannelMonitorV4InsightFixture(t)
	insights, err := svc.V4GroupInsights(context.Background(), ChannelMonitorV2Filter{
		GroupIDs: []int64{1, 2, 3}, RestrictGroups: true, AllowedGroupIDs: []int64{1, 2},
	})
	require.NoError(t, err)
	require.Equal(t, []int64{1, 2}, repo.asked, "a user only reads the groups available to them")
	require.Len(t, insights, 2)
	require.Len(t, insights[0].Samples, 1)
	require.NotNil(t, insights[0].CacheRate)
	require.InDelta(t, 0.85, *insights[0].CacheRate, 1e-12)
	require.Empty(t, insights[1].Samples)
	require.Nil(t, insights[1].CacheRate, "no traffic leaves the cache rate unknown")
}

func TestChannelMonitorV4InsightsAdminIsUnscoped(t *testing.T) {
	svc, repo := newChannelMonitorV4InsightFixture(t)
	_, err := svc.V4GroupInsights(context.Background(), ChannelMonitorV2Filter{GroupIDs: []int64{1, 3}})
	require.NoError(t, err)
	require.Equal(t, []int64{1, 3}, repo.asked)
}

func TestChannelMonitorV4InsightsFollowMonitorState(t *testing.T) {
	svc, repo := newChannelMonitorV4InsightFixture(t)
	repo.config.Enabled = false
	_, err := svc.V4GroupInsights(context.Background(), ChannelMonitorV2Filter{GroupIDs: []int64{1}})
	require.ErrorIs(t, err, ErrChannelMonitorDisabled)
	require.Nil(t, repo.asked, "nothing is read while the monitor is off")

}
