-- Channel monitor v4 (the v1 card page on the v2 engine) is the view of a fresh install, over the
-- official default mode v1 (195_channel_monitor_mode.sql). A database that already has users is an
-- existing site and keeps its saved choice; the admin can pick v4 in the channel monitor page.
INSERT INTO settings (key, value)
SELECT 'channel_monitor_v4_selection', 'v4:v1'
WHERE NOT EXISTS (SELECT 1 FROM users)
ON CONFLICT (key) DO NOTHING;
