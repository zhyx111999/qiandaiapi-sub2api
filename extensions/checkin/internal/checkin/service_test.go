package checkin

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"yezi/checkin/internal/reward"
	"yezi/checkin/internal/store"
	"yezi/checkin/internal/sub2api"
)

type recordKey struct {
	user int64
	day  string
}

type memoryStore struct {
	cfg     store.Config
	records map[recordKey]store.Record
}

func newMemoryStore(enabled bool, minCents, maxCents int64) *memoryStore {
	return &memoryStore{
		cfg:     store.Config{Enabled: enabled, Reward: reward.Range{MinCents: minCents, MaxCents: maxCents}},
		records: map[recordKey]store.Record{},
	}
}

func (m *memoryStore) Config(context.Context) (store.Config, error) { return m.cfg, nil }

func (m *memoryStore) SaveConfig(_ context.Context, c store.Config) error {
	m.cfg = c
	return nil
}

func (m *memoryStore) Find(_ context.Context, user int64, day string) (*store.Record, error) {
	rec, ok := m.records[recordKey{user, day}]
	if !ok {
		return nil, nil
	}
	return &rec, nil
}

func (m *memoryStore) Claim(_ context.Context, user int64, day string, amount int64) (store.Record, error) {
	key := recordKey{user, day}
	if rec, ok := m.records[key]; ok {
		return rec, nil
	}
	rec := store.Record{AmountCents: amount}
	m.records[key] = rec
	return rec, nil
}

func (m *memoryStore) MarkCredited(_ context.Context, user int64, day string) error {
	key := recordKey{user, day}
	rec := m.records[key]
	rec.Credited = true
	m.records[key] = rec
	return nil
}

type credit struct {
	user   int64
	amount float64
	notes  string
	key    string
}

type fakeBackend struct {
	users    map[string]sub2api.Identity
	credits  []credit
	failNext bool
	balance  float64
}

func (f *fakeBackend) Identify(_ context.Context, from http.Header) (sub2api.Identity, error) {
	who, ok := f.users[from.Get("Authorization")]
	if !ok {
		return sub2api.Identity{}, &sub2api.APIError{Status: http.StatusUnauthorized, Body: []byte(`{"code":"UNAUTHORIZED","message":"Authorization header is required"}`)}
	}
	return who, nil
}

func (f *fakeBackend) Credit(_ context.Context, user int64, amount float64, notes, key string) (float64, error) {
	if f.failNext {
		f.failNext = false
		return 0, &sub2api.APIError{Status: http.StatusUnauthorized, Body: []byte(`{"code":401,"message":"Invalid admin API key","reason":"INVALID_ADMIN_KEY"}`)}
	}
	f.credits = append(f.credits, credit{user, amount, notes, key})
	f.balance += amount
	return f.balance, nil
}

func header(token string) http.Header {
	h := http.Header{}
	h.Set("Authorization", token)
	return h
}

// 2026-10-27 09:00 Beijing, inside check-in day 2026-10-27.
var fixedNow = time.Date(2026, 10, 27, 1, 0, 0, 0, time.UTC)

func newTestService(st *memoryStore) (*Service, *fakeBackend) {
	backend := &fakeBackend{users: map[string]sub2api.Identity{
		"Bearer user":  {ID: 7, Role: "user"},
		"Bearer admin": {ID: 1, Role: "admin"},
	}}
	return NewService(st, backend, func() time.Time { return fixedNow }), backend
}

func TestCheckInCreditsOncePerDay(t *testing.T) {
	svc, backend := newTestService(newMemoryStore(true, 300, 500))
	ctx := context.Background()

	result, err := svc.CheckIn(ctx, header("Bearer user"))
	if err != nil {
		t.Fatal(err)
	}
	if result.RewardAmount < 3 || result.RewardAmount > 5 {
		t.Fatalf("reward %v outside 3..5", result.RewardAmount)
	}
	if _, err := svc.CheckIn(ctx, header("Bearer user")); !errors.Is(err, ErrAlreadyDone) {
		t.Fatalf("second check-in error = %v, want ErrAlreadyDone", err)
	}
	if len(backend.credits) != 1 {
		t.Fatalf("credits = %d, want 1", len(backend.credits))
	}
	got := backend.credits[0]
	if got.user != 7 || got.key != "yezi-checkin-7-2026-10-27" || got.notes != "每日签到 2026-10-27" {
		t.Fatalf("unexpected credit %+v", got)
	}

	status, err := svc.Status(ctx, header("Bearer user"))
	if err != nil {
		t.Fatal(err)
	}
	if !status.CheckedIn || status.RewardAmount == nil || *status.RewardAmount != result.RewardAmount {
		t.Fatalf("status after check-in = %+v", status)
	}
	if want := time.Date(2026, 10, 28, 0, 0, 0, 0, time.UTC); !status.NextResetAt.Equal(want) {
		t.Fatalf("next reset = %s, want %s", status.NextResetAt, want)
	}
}

func TestFailedCreditIsRetriedWithSameAmountAndKey(t *testing.T) {
	st := newMemoryStore(true, 300, 500)
	svc, backend := newTestService(st)
	backend.failNext = true
	ctx := context.Background()

	_, err := svc.CheckIn(ctx, header("Bearer user"))
	if !errors.Is(err, ErrCreditFailed) {
		t.Fatalf("error = %v, want ErrCreditFailed", err)
	}
	var ce *Error
	if !errors.As(err, &ce) || ce.Status != http.StatusBadGateway {
		t.Fatalf("credit failure must surface as 502, got %v", err)
	}
	if status, _ := svc.Status(ctx, header("Bearer user")); status.CheckedIn {
		t.Fatal("an uncredited claim must not count as checked in")
	}

	claimed := st.records[recordKey{7, "2026-10-27"}].AmountCents
	st.cfg.Reward = reward.Range{MinCents: 900, MaxCents: 900} // a new draw would differ
	result, err := svc.CheckIn(ctx, header("Bearer user"))
	if err != nil {
		t.Fatal(err)
	}
	if reward.ToCents(result.RewardAmount) != claimed {
		t.Fatalf("retry credited %v, want the claimed %d cents", result.RewardAmount, claimed)
	}
	if len(backend.credits) != 1 || backend.credits[0].key != "yezi-checkin-7-2026-10-27" {
		t.Fatalf("credits = %+v", backend.credits)
	}
}

func TestCheckInDisabled(t *testing.T) {
	svc, backend := newTestService(newMemoryStore(false, 300, 500))
	if _, err := svc.CheckIn(context.Background(), header("Bearer user")); !errors.Is(err, ErrDisabled) {
		t.Fatalf("error = %v, want ErrDisabled", err)
	}
	if len(backend.credits) != 0 {
		t.Fatal("disabled check-in must not credit")
	}
}

func TestUnauthenticatedCallerGetsBackendError(t *testing.T) {
	svc, _ := newTestService(newMemoryStore(true, 300, 500))
	_, err := svc.Status(context.Background(), header("Bearer expired"))
	var apiErr *sub2api.APIError
	if !errors.As(err, &apiErr) || apiErr.Status != http.StatusUnauthorized {
		t.Fatalf("error = %v, want the backend 401", err)
	}
}

func TestAdminsCheckInAndOwnSettings(t *testing.T) {
	st := newMemoryStore(false, 300, 500)
	svc, _ := newTestService(st)
	ctx := context.Background()

	if _, err := svc.UpdateSettings(ctx, header("Bearer user"), Settings{Enabled: true, RewardMin: 1, RewardMax: 2}); !errors.Is(err, ErrAdminOnly) {
		t.Fatalf("user update error = %v, want ErrAdminOnly", err)
	}
	for _, bad := range []Settings{{true, 0, 5}, {true, 5, 3}, {true, -1, 2}} {
		if _, err := svc.UpdateSettings(ctx, header("Bearer admin"), bad); !errors.Is(err, ErrInvalidRange) {
			t.Fatalf("update %+v error = %v, want ErrInvalidRange", bad, err)
		}
	}
	saved, err := svc.UpdateSettings(ctx, header("Bearer admin"), Settings{Enabled: true, RewardMin: 3, RewardMax: 5})
	if err != nil {
		t.Fatal(err)
	}
	if saved != (Settings{Enabled: true, RewardMin: 3, RewardMax: 5}) || st.cfg.Reward != (reward.Range{MinCents: 300, MaxCents: 500}) {
		t.Fatalf("saved = %+v, stored = %+v", saved, st.cfg)
	}

	status, err := svc.Status(ctx, header("Bearer admin"))
	if err != nil || !status.IsAdmin || !status.Enabled {
		t.Fatalf("admin status = %+v, %v", status, err)
	}
	if _, err := svc.CheckIn(ctx, header("Bearer admin")); err != nil {
		t.Fatalf("admin check-in: %v", err)
	}
}
