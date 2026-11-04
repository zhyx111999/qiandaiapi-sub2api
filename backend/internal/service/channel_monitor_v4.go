package service

// Channel monitor v4: the v1 card page on the v2 detection engine (real-traffic statistics and the
// candy question). v4 is a channel_monitor_mode value like v1–v3: the admin picks it in the channel
// monitor page or the system settings, the user page shows the v4 cards, and the runtime runs the
// v2 engine for it (channelMonitorEngine). The cards add per-group insights on top of the v2 data
// (channel_monitor_v4_insights.go). A fresh install starts on v4
// (329_channel_monitor_v4_selection.sql, turned into the mode by 333_channel_monitor_v4_mode.sql).

// channelMonitorEngine is the implementation a mode runs: v4 runs the v2 engine, every other mode
// runs itself.
func channelMonitorEngine(mode string) string {
	if mode == ChannelMonitorModeV4 {
		return ChannelMonitorModeV2
	}
	return mode
}
