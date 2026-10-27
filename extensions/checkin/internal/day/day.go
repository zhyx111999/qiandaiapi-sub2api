// Package day maps an instant to its check-in day. Days roll over at 08:00
// Beijing time, so the day "2026-10-27" runs from 10-27 08:00 to 10-28 08:00.
package day

import "time"

const resetHour = 8

// Beijing has no daylight saving time, so a fixed zone avoids shipping tzdata.
var beijing = time.FixedZone("Asia/Shanghai", 8*60*60)

// Key returns the check-in day containing t as YYYY-MM-DD.
func Key(t time.Time) string {
	return start(t).Format(time.DateOnly)
}

// NextReset returns the instant the check-in day containing t ends.
func NextReset(t time.Time) time.Time {
	return start(t).AddDate(0, 0, 1)
}

func start(t time.Time) time.Time {
	shifted := t.In(beijing).Add(-resetHour * time.Hour)
	y, m, d := shifted.Date()
	return time.Date(y, m, d, resetHour, 0, 0, 0, beijing)
}
