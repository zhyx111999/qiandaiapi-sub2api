package day

import (
	"testing"
	"time"
)

func beijingTime(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.ParseInLocation(time.DateTime, value, beijing)
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}

func TestKeyRollsOverAtEightBeijing(t *testing.T) {
	cases := map[string]string{
		"2026-10-27 07:59:59": "2026-10-26",
		"2026-10-27 08:00:00": "2026-10-27",
		"2026-10-27 23:30:00": "2026-10-27",
		"2026-10-28 07:59:59": "2026-10-27",
		"2026-01-01 03:00:00": "2025-12-31",
	}
	for at, want := range cases {
		if got := Key(beijingTime(t, at)); got != want {
			t.Errorf("Key(%s) = %s, want %s", at, got, want)
		}
	}
}

func TestKeyIgnoresInputZone(t *testing.T) {
	// 00:00 UTC is 08:00 Beijing: the first instant of the new day.
	if got := Key(time.Date(2026, 10, 27, 0, 0, 0, 0, time.UTC)); got != "2026-10-27" {
		t.Fatalf("Key(UTC midnight) = %s", got)
	}
	if got := Key(time.Date(2026, 10, 26, 23, 59, 59, 0, time.UTC)); got != "2026-10-26" {
		t.Fatalf("Key(UTC 23:59:59) = %s", got)
	}
}

func TestNextReset(t *testing.T) {
	want := beijingTime(t, "2026-10-28 08:00:00")
	for _, at := range []string{"2026-10-27 08:00:00", "2026-10-27 20:00:00", "2026-10-28 07:59:59"} {
		if got := NextReset(beijingTime(t, at)); !got.Equal(want) {
			t.Errorf("NextReset(%s) = %s, want %s", at, got, want)
		}
	}
}
