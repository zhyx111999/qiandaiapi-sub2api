-- Channel monitor v4 becomes a channel_monitor_mode value. It used to be an overlay setting
-- "v4:<official mode>" that stood while the saved official mode was still that mode; a site where
-- it stands now saves mode v4, and the overlay setting goes away.
INSERT INTO settings (key, value)
SELECT 'channel_monitor_mode', 'v4'
WHERE EXISTS (
    SELECT 1 FROM settings overlay
    WHERE overlay.key = 'channel_monitor_v4_selection'
      AND overlay.value = 'v4:' || COALESCE((
          SELECT CASE lower(trim(mode.value)) WHEN 'v2' THEN 'v2' WHEN 'v3' THEN 'v3' ELSE 'v1' END
          FROM settings mode WHERE mode.key = 'channel_monitor_mode'), 'v1')
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

DELETE FROM settings WHERE key = 'channel_monitor_v4_selection';
