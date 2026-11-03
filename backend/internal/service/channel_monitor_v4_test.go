package service

import (
	"context"
	"errors"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/stretchr/testify/require"
)

// channelMonitorViewRepo is an in-memory settings store for the v4 overlay tests.
type channelMonitorViewRepo struct {
	SettingRepository
	values  map[string]string
	setErr  error
	written []string
}

func newChannelMonitorViewRepo(values map[string]string) *channelMonitorViewRepo {
	return &channelMonitorViewRepo{values: values}
}

func (r *channelMonitorViewRepo) GetMultiple(_ context.Context, keys []string) (map[string]string, error) {
	out := map[string]string{}
	for _, key := range keys {
		if value, ok := r.values[key]; ok {
			out[key] = value
		}
	}
	return out, nil
}

func (r *channelMonitorViewRepo) Set(_ context.Context, key, value string) error {
	if r.setErr != nil {
		return r.setErr
	}
	r.values[key] = value
	r.written = append(r.written, key)
	return nil
}

func TestChannelMonitorRuntimeRunsV2EngineUnderV4(t *testing.T) {
	for _, official := range []string{ChannelMonitorModeV1, ChannelMonitorModeV2, ChannelMonitorModeV3} {
		repo := newChannelMonitorViewRepo(map[string]string{
			SettingKeyChannelMonitorMode:        official,
			SettingKeyChannelMonitorV4Selection: "v4:" + official,
		})
		rt := NewSettingService(repo, &config.Config{}).GetChannelMonitorRuntime(context.Background())
		require.Equal(t, ChannelMonitorModeV2, rt.Mode, official)
		require.True(t, rt.V2Active(), official)
		require.True(t, rt.PassiveAggregationAllowed(), official)
		require.False(t, rt.ActiveProbesAllowed(), "v4 retires the v1 active probes: %s", official)
		require.False(t, rt.V3Active(), official)
	}
}

func TestChannelMonitorRuntimeOfficialModeWinsWithoutValidOverlay(t *testing.T) {
	for name, values := range map[string]map[string]string{
		"no overlay":      {SettingKeyChannelMonitorMode: ChannelMonitorModeV1},
		"explicit":        {SettingKeyChannelMonitorMode: ChannelMonitorModeV3, SettingKeyChannelMonitorV4Selection: "official"},
		"stale stamp":     {SettingKeyChannelMonitorMode: ChannelMonitorModeV3, SettingKeyChannelMonitorV4Selection: "v4:v1"},
		"garbage overlay": {SettingKeyChannelMonitorMode: ChannelMonitorModeV2, SettingKeyChannelMonitorV4Selection: "v4"},
	} {
		rt := NewSettingService(newChannelMonitorViewRepo(values), &config.Config{}).GetChannelMonitorRuntime(context.Background())
		require.Equal(t, normalizeChannelMonitorMode(values[SettingKeyChannelMonitorMode]), rt.Mode, name)
	}
}

func TestPublicSettingsReportEngineModeUnderV4(t *testing.T) {
	svc := NewSettingService(newChannelMonitorViewRepo(map[string]string{
		SettingKeyChannelMonitorMode:        ChannelMonitorModeV1,
		SettingKeyChannelMonitorV4Selection: "v4:v1",
	}), &config.Config{})
	public, err := svc.GetPublicSettings(context.Background())
	require.NoError(t, err)
	require.Equal(t, ChannelMonitorModeV2, public.ChannelMonitorMode)
}

func TestChannelMonitorViewReportsOverlay(t *testing.T) {
	repo := newChannelMonitorViewRepo(map[string]string{SettingKeyChannelMonitorMode: ChannelMonitorModeV1})
	svc := NewSettingService(repo, &config.Config{})
	view, err := svc.ChannelMonitorView(context.Background())
	require.NoError(t, err)
	require.Equal(t, ChannelMonitorView{View: "v1"}, view)
	repo.values[SettingKeyChannelMonitorV4Selection] = "v4:v1"
	view, err = svc.ChannelMonitorView(context.Background())
	require.NoError(t, err)
	require.Equal(t, ChannelMonitorView{View: "v4"}, view)
}

func TestSetChannelMonitorViewV4KeepsOfficialMode(t *testing.T) {
	repo := newChannelMonitorViewRepo(map[string]string{SettingKeyChannelMonitorMode: ChannelMonitorModeV3})
	svc := NewSettingService(repo, &config.Config{})
	notified, updated := 0, 0
	svc.SubscribeChannelMonitorRuntime(func() { notified++ })
	svc.SetOnUpdateCallback(func() { updated++ })

	view, err := svc.SetChannelMonitorView(context.Background(), " V4 ")
	require.NoError(t, err)
	require.Equal(t, ChannelMonitorView{View: "v4"}, view)
	require.Equal(t, ChannelMonitorModeV3, repo.values[SettingKeyChannelMonitorMode], "the official key is never written by v4")
	require.Equal(t, "v4:v3", repo.values[SettingKeyChannelMonitorV4Selection])
	require.Equal(t, []string{SettingKeyChannelMonitorV4Selection}, repo.written)
	require.Equal(t, 1, notified, "the aggregator wakes up on the switch")
	require.Equal(t, 1, updated, "injected public settings are refreshed")
	require.Equal(t, ChannelMonitorModeV2, svc.GetChannelMonitorRuntime(context.Background()).Mode)
}

func TestSetChannelMonitorViewOfficialClearsOverlay(t *testing.T) {
	for _, target := range []string{ChannelMonitorModeV1, ChannelMonitorModeV2, ChannelMonitorModeV3} {
		repo := newChannelMonitorViewRepo(map[string]string{
			SettingKeyChannelMonitorMode:        ChannelMonitorModeV1,
			SettingKeyChannelMonitorV4Selection: "v4:v1",
		})
		svc := NewSettingService(repo, &config.Config{})
		notified := 0
		svc.SubscribeChannelMonitorRuntime(func() { notified++ })

		view, err := svc.SetChannelMonitorView(context.Background(), target)
		require.NoError(t, err)
		require.Equal(t, ChannelMonitorView{View: target}, view)
		require.Equal(t, target, repo.values[SettingKeyChannelMonitorMode])
		require.Equal(t, "official", repo.values[SettingKeyChannelMonitorV4Selection])
		require.Equal(t, 1, notified)
		require.Equal(t, target, svc.GetChannelMonitorRuntime(context.Background()).Mode, "v1 must not stay on the v2 engine")
	}
}

func TestSetChannelMonitorViewRejectsInvalid(t *testing.T) {
	repo := newChannelMonitorViewRepo(map[string]string{SettingKeyChannelMonitorV4Selection: "v4:v1"})
	svc := NewSettingService(repo, &config.Config{})
	for _, bad := range []string{"", "v5", "official", "v4:v1"} {
		_, err := svc.SetChannelMonitorView(context.Background(), bad)
		require.ErrorIs(t, err, ErrChannelMonitorInvalidMode, bad)
	}
	require.Empty(t, repo.written, "a rejected view must not touch the overlay")
}

func TestSetChannelMonitorViewReportsWriteFailure(t *testing.T) {
	repo := newChannelMonitorViewRepo(map[string]string{SettingKeyChannelMonitorMode: ChannelMonitorModeV1})
	repo.setErr = errors.New("down")
	svc := NewSettingService(repo, &config.Config{})
	_, err := svc.SetChannelMonitorView(context.Background(), "v4")
	require.ErrorIs(t, err, repo.setErr)
	_, err = svc.SetChannelMonitorView(context.Background(), "v2")
	require.ErrorIs(t, err, repo.setErr)
}

// A system-settings save only writes the official key. When it changes the
// mode, the stamped overlay no longer matches and the official choice wins.
func TestOfficialModeChangeInvalidatesOverlay(t *testing.T) {
	repo := newChannelMonitorViewRepo(map[string]string{
		SettingKeyChannelMonitorMode:        ChannelMonitorModeV1,
		SettingKeyChannelMonitorV4Selection: "v4:v1",
	})
	svc := NewSettingService(repo, &config.Config{})
	require.Equal(t, ChannelMonitorModeV2, svc.GetChannelMonitorRuntime(context.Background()).Mode)
	repo.values[SettingKeyChannelMonitorMode] = ChannelMonitorModeV3
	require.Equal(t, ChannelMonitorModeV3, svc.GetChannelMonitorRuntime(context.Background()).Mode)
}
