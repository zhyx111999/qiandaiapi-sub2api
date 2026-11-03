package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/lib/pq"
)

// ChannelMonitorV4RecentRequests reads the newest successful requests with a
// recorded first token per group, bounded by idx_usage_logs_group_created_at_not_null.
func (r *channelMonitorV2Repository) ChannelMonitorV4RecentRequests(ctx context.Context, groupIDs []int64, since time.Time, perGroup int) (map[int64][]service.ChannelMonitorV4RequestSample, error) {
	rows, err := r.db.QueryContext(ctx, `
SELECT g.id, u.created_at, u.first_token_ms, u.duration_ms, u.output_tokens, u.image_count, u.image_output_tokens, u.billing_mode
FROM unnest($1::bigint[]) AS g(id)
CROSS JOIN LATERAL (
	SELECT created_at, first_token_ms, duration_ms, output_tokens, image_count, image_output_tokens, billing_mode
	FROM usage_logs
	WHERE group_id = g.id AND created_at >= $2 AND first_token_ms IS NOT NULL
	ORDER BY created_at DESC
	LIMIT $3
) AS u
ORDER BY g.id, u.created_at DESC`, pq.Array(groupIDs), since, perGroup)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	result := make(map[int64][]service.ChannelMonitorV4RequestSample, len(groupIDs))
	for rows.Next() {
		var (
			groupID  int64
			sample   service.ChannelMonitorV4RequestSample
			duration sql.NullInt64
			mode     sql.NullString
		)
		if err := rows.Scan(&groupID, &sample.At, &sample.FirstTokenMs, &duration, &sample.OutputTokens, &sample.ImageCount, &sample.ImageOutputTokens, &mode); err != nil {
			return nil, err
		}
		if duration.Valid {
			value := int(duration.Int64)
			sample.DurationMs = &value
		}
		if mode.Valid {
			value := mode.String
			sample.BillingMode = &value
		}
		result[groupID] = append(result[groupID], sample)
	}
	return result, rows.Err()
}

// ChannelMonitorV4CacheTotals sums the v2 one-minute rollups since the given time.
func (r *channelMonitorV2Repository) ChannelMonitorV4CacheTotals(ctx context.Context, groupIDs []int64, since time.Time) (map[int64]service.ChannelMonitorV4CacheTotals, error) {
	rows, err := r.db.QueryContext(ctx, `
SELECT group_id, COALESCE(SUM(input_tokens), 0), COALESCE(SUM(cache_creation_tokens), 0), COALESCE(SUM(cache_read_tokens), 0)
FROM channel_monitor_v2_metrics_1m
WHERE group_id = ANY($1::bigint[]) AND bucket_start >= $2
GROUP BY group_id`, pq.Array(groupIDs), since)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	result := make(map[int64]service.ChannelMonitorV4CacheTotals, len(groupIDs))
	for rows.Next() {
		var (
			groupID int64
			totals  service.ChannelMonitorV4CacheTotals
		)
		if err := rows.Scan(&groupID, &totals.Input, &totals.CacheCreation, &totals.CacheRead); err != nil {
			return nil, err
		}
		result[groupID] = totals
	}
	return result, rows.Err()
}
