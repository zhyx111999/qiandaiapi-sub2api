package service

import (
	"context"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/stretchr/testify/require"
)

// channelMonitorModeRepo is an in-memory settings store for the v4 mode tests.
type channelMonitorModeRepo struct {
	SettingRepository
	values map[string]string
}

func (r *channelMonitorModeRepo) GetMultiple(_ context.Context, keys []string) (map[string]string, error) {
	out := map[string]string{}
	for _, key := range keys {
		if value, ok := r.values[key]; ok {
			out[key] = value
		}
	}
	return out, nil
}

func (r *channelMonitorModeRepo) Set(_ context.Context, key, value string) error {
	r.values[key] = value
	return nil
}

func TestChannelMonitorModeV4IsAModeOfItsOwn(t *testing.T) {
	require.Equal(t, ChannelMonitorModeV4, normalizeChannelMonitorMode(" V4 "))
	require.Equal(t, ChannelMonitorModeV1, normalizeChannelMonitorMode("v5"))

	repo := &channelMonitorModeRepo{values: map[string]string{SettingKeyChannelMonitorMode: ChannelMonitorModeV1}}
	svc := NewSettingService(repo, &config.Config{})
	mode, err := svc.SetChannelMonitorMode(context.Background(), "v4")
	require.NoError(t, err)
	require.Equal(t, ChannelMonitorModeV4, mode)
	require.Equal(t, ChannelMonitorModeV4, repo.values[SettingKeyChannelMonitorMode])

	public, err := svc.GetPublicSettings(context.Background())
	require.NoError(t, err)
	require.Equal(t, ChannelMonitorModeV4, public.ChannelMonitorMode, "the site reports v4 itself")
}

func TestChannelMonitorRuntimeRunsV2EngineUnderV4(t *testing.T) {
	repo := &channelMonitorModeRepo{values: map[string]string{SettingKeyChannelMonitorMode: ChannelMonitorModeV4}}
	rt := NewSettingService(repo, &config.Config{}).GetChannelMonitorRuntime(context.Background())
	require.Equal(t, ChannelMonitorModeV4, rt.Mode)
	require.True(t, rt.V2Active(), "v4 runs the v2 views and candy probes")
	require.True(t, rt.PassiveAggregationAllowed())
	require.False(t, rt.ActiveProbesAllowed(), "v4 retires the v1 active probes")
	require.False(t, rt.V3Active())

	rt.Enabled = false
	require.False(t, rt.V2Active(), "a disabled monitor runs nothing")
}

func TestChannelMonitorEngineKeepsOtherModes(t *testing.T) {
	for _, mode := range []string{ChannelMonitorModeV1, ChannelMonitorModeV2, ChannelMonitorModeV3} {
		require.Equal(t, mode, channelMonitorEngine(mode))
	}
	require.Equal(t, ChannelMonitorModeV2, channelMonitorEngine(ChannelMonitorModeV4))
}
