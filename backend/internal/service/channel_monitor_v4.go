package service

import (
	"context"
	"fmt"
	"strings"
)

// Channel monitor v4: the v1 card page on the v2 detection engine (real-traffic statistics and
// the candy question). It is an overlay, so the official channel_monitor_mode keeps its official
// values and meaning (migrations, UpdateSettings and normalizeChannelMonitorMode only know
// v1/v2/v3): the overlay lives in its own setting, "v4:<official mode>", and stands only while the
// saved official mode is still that mode. Changing the official mode in the system settings
// therefore drops the overlay and the official choice wins. A fresh install starts on v4
// (329_channel_monitor_v4_selection.sql).
const (
	SettingKeyChannelMonitorV4Selection = "channel_monitor_v4_selection"

	channelMonitorViewV4   = "v4"
	channelMonitorV4Engine = ChannelMonitorModeV2
	// channelMonitorV4Cleared marks an overlay cleared by choosing an official view.
	channelMonitorV4Cleared = "official"
)

// ChannelMonitorView is the monitor view a site shows: v1, v2, v3 or v4.
type ChannelMonitorView struct {
	View string `json:"view"`
}

func channelMonitorV4Selection(official string) string { return channelMonitorViewV4 + ":" + official }

// resolveChannelMonitorView returns the view the site shows and the official engine that runs it.
func resolveChannelMonitorView(vals map[string]string) (view, engine string) {
	official := normalizeChannelMonitorMode(vals[SettingKeyChannelMonitorMode])
	if strings.ToLower(strings.TrimSpace(vals[SettingKeyChannelMonitorV4Selection])) == channelMonitorV4Selection(official) {
		return channelMonitorViewV4, channelMonitorV4Engine
	}
	return official, official
}

// channelMonitorEngineMode is the mode the official runtime and the public settings see: v4 runs
// on the v2 engine, every other view is the saved mode.
func channelMonitorEngineMode(vals map[string]string) string {
	_, engine := resolveChannelMonitorView(vals)
	return engine
}

// ChannelMonitorView reports the view the site shows.
func (s *SettingService) ChannelMonitorView(ctx context.Context) (ChannelMonitorView, error) {
	vals, err := s.settingRepo.GetMultiple(ctx, []string{SettingKeyChannelMonitorMode, SettingKeyChannelMonitorV4Selection})
	if err != nil {
		return ChannelMonitorView{}, fmt.Errorf("get channel monitor view: %w", err)
	}
	view, _ := resolveChannelMonitorView(vals)
	return ChannelMonitorView{View: view}, nil
}

// SetChannelMonitorView switches the site to v1, v2, v3 or v4. The official views go through
// SetChannelMonitorMode after the overlay is cleared; v4 only writes the overlay, so the saved
// official mode survives and comes back when another view is chosen. The overlay is cleared first:
// a failed switch then leaves the saved official mode in charge instead of a stale v4.
func (s *SettingService) SetChannelMonitorView(ctx context.Context, view string) (ChannelMonitorView, error) {
	view = strings.ToLower(strings.TrimSpace(view))
	if view == channelMonitorViewV4 {
		return s.selectChannelMonitorV4(ctx)
	}
	if normalizeChannelMonitorMode(view) != view {
		return ChannelMonitorView{}, ErrChannelMonitorInvalidMode
	}
	if err := s.settingRepo.Set(ctx, SettingKeyChannelMonitorV4Selection, channelMonitorV4Cleared); err != nil {
		return ChannelMonitorView{}, fmt.Errorf("clear channel monitor v4: %w", err)
	}
	if _, err := s.SetChannelMonitorMode(ctx, view); err != nil {
		return ChannelMonitorView{}, err
	}
	return ChannelMonitorView{View: view}, nil
}

func (s *SettingService) selectChannelMonitorV4(ctx context.Context) (ChannelMonitorView, error) {
	saved, err := s.settingRepo.GetMultiple(ctx, []string{SettingKeyChannelMonitorMode})
	if err != nil {
		return ChannelMonitorView{}, fmt.Errorf("get channel monitor mode: %w", err)
	}
	official := normalizeChannelMonitorMode(saved[SettingKeyChannelMonitorMode])
	if err := s.settingRepo.Set(ctx, SettingKeyChannelMonitorV4Selection, channelMonitorV4Selection(official)); err != nil {
		return ChannelMonitorView{}, fmt.Errorf("set channel monitor v4: %w", err)
	}
	if s.onUpdate != nil {
		s.onUpdate() // injected public settings carry the engine mode
	}
	s.notifyChannelMonitorRuntimeListeners()
	return ChannelMonitorView{View: channelMonitorViewV4}, nil
}
