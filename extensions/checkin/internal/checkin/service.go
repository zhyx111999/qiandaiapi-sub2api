// Package checkin implements the daily check-in: one randomly drawn, positive
// reward per user per check-in day, credited through the official backend.
package checkin

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"yezi/checkin/internal/day"
	"yezi/checkin/internal/reward"
	"yezi/checkin/internal/store"
	"yezi/checkin/internal/sub2api"
)

// Store persists the configuration and the daily records.
type Store interface {
	Config(ctx context.Context) (store.Config, error)
	SaveConfig(ctx context.Context, c store.Config) error
	Find(ctx context.Context, userID int64, day string) (*store.Record, error)
	Claim(ctx context.Context, userID int64, day string, amountCents int64) (store.Record, error)
	MarkCredited(ctx context.Context, userID int64, day string) error
}

// Backend is the official Sub2API backend.
type Backend interface {
	Identify(ctx context.Context, from http.Header) (sub2api.Identity, error)
	Credit(ctx context.Context, userID int64, amount float64, notes, idempotencyKey string) (float64, error)
}

// Error is a check-in failure with the HTTP status and stable reason it maps to.
type Error struct {
	Status  int
	Reason  string
	Message string
}

func (e *Error) Error() string { return e.Message }

var (
	ErrDisabled     = &Error{http.StatusForbidden, "CHECKIN_DISABLED", "daily check-in is disabled"}
	ErrAlreadyDone  = &Error{http.StatusConflict, "CHECKIN_ALREADY_DONE", "already checked in today"}
	ErrAdminOnly    = &Error{http.StatusForbidden, "CHECKIN_ADMIN_ONLY", "only administrators can change check-in settings"}
	ErrInvalidRange = &Error{http.StatusBadRequest, "CHECKIN_INVALID_RANGE", "reward range must satisfy 0 < min <= max"}
	ErrCreditFailed = &Error{http.StatusBadGateway, "CHECKIN_CREDIT_FAILED", "the reward could not be credited, please try again"}
)

// Status is what the profile card shows.
type Status struct {
	Enabled      bool      `json:"enabled"`
	RewardMin    float64   `json:"reward_min"`
	RewardMax    float64   `json:"reward_max"`
	CheckedIn    bool      `json:"checked_in"`
	RewardAmount *float64  `json:"reward_amount,omitempty"`
	NextResetAt  time.Time `json:"next_reset_at"`
	IsAdmin      bool      `json:"is_admin"`
}

// Result is a successful check-in.
type Result struct {
	RewardAmount float64   `json:"reward_amount"`
	NewBalance   float64   `json:"new_balance"`
	NextResetAt  time.Time `json:"next_reset_at"`
}

// Settings is the administrator-editable configuration, in currency units.
type Settings struct {
	Enabled   bool    `json:"enabled"`
	RewardMin float64 `json:"reward_min"`
	RewardMax float64 `json:"reward_max"`
}

// Service is the check-in use case.
type Service struct {
	store   Store
	backend Backend
	now     func() time.Time
}

// NewService wires the service; now is injectable for tests.
func NewService(st Store, backend Backend, now func() time.Time) *Service {
	return &Service{store: st, backend: backend, now: now}
}

// Status reports the caller's check-in state for the current day.
func (s *Service) Status(ctx context.Context, from http.Header) (Status, error) {
	who, err := s.backend.Identify(ctx, from)
	if err != nil {
		return Status{}, err
	}
	cfg, err := s.store.Config(ctx)
	if err != nil {
		return Status{}, err
	}
	now := s.now()
	rec, err := s.store.Find(ctx, who.ID, day.Key(now))
	if err != nil {
		return Status{}, err
	}
	status := Status{
		Enabled:     cfg.Enabled,
		RewardMin:   reward.FromCents(cfg.Reward.MinCents),
		RewardMax:   reward.FromCents(cfg.Reward.MaxCents),
		NextResetAt: day.NextReset(now),
		IsAdmin:     who.IsAdmin(),
	}
	if rec != nil && rec.Credited {
		amount := reward.FromCents(rec.AmountCents)
		status.CheckedIn = true
		status.RewardAmount = &amount
	}
	return status, nil
}

// CheckIn claims today's reward for the caller and credits it. A claim whose
// credit failed is retried with the same amount and idempotency key.
func (s *Service) CheckIn(ctx context.Context, from http.Header) (Result, error) {
	who, err := s.backend.Identify(ctx, from)
	if err != nil {
		return Result{}, err
	}
	cfg, err := s.store.Config(ctx)
	if err != nil {
		return Result{}, err
	}
	if !cfg.Enabled {
		return Result{}, ErrDisabled
	}
	drawn, err := cfg.Reward.Draw()
	if err != nil {
		return Result{}, ErrInvalidRange
	}

	now := s.now()
	today := day.Key(now)
	rec, err := s.store.Claim(ctx, who.ID, today, drawn)
	if err != nil {
		return Result{}, err
	}
	if rec.Credited {
		return Result{}, ErrAlreadyDone
	}

	amount := reward.FromCents(rec.AmountCents)
	key := fmt.Sprintf("yezi-checkin-%d-%s", who.ID, today)
	balance, err := s.backend.Credit(ctx, who.ID, amount, "每日签到 "+today, key)
	if err != nil {
		// Never relay the admin-key call's status: a 401 would log the user out.
		return Result{}, errors.Join(ErrCreditFailed, err)
	}
	if err := s.store.MarkCredited(ctx, who.ID, today); err != nil {
		return Result{}, err
	}
	return Result{RewardAmount: amount, NewBalance: balance, NextResetAt: day.NextReset(now)}, nil
}

// UpdateSettings replaces the site-wide configuration; administrators only.
func (s *Service) UpdateSettings(ctx context.Context, from http.Header, in Settings) (Settings, error) {
	who, err := s.backend.Identify(ctx, from)
	if err != nil {
		return Settings{}, err
	}
	if !who.IsAdmin() {
		return Settings{}, ErrAdminOnly
	}
	cfg := store.Config{
		Enabled: in.Enabled,
		Reward:  reward.Range{MinCents: reward.ToCents(in.RewardMin), MaxCents: reward.ToCents(in.RewardMax)},
	}
	if err := cfg.Reward.Validate(); err != nil {
		return Settings{}, ErrInvalidRange
	}
	if err := s.store.SaveConfig(ctx, cfg); err != nil {
		return Settings{}, err
	}
	return Settings{
		Enabled:   cfg.Enabled,
		RewardMin: reward.FromCents(cfg.Reward.MinCents),
		RewardMax: reward.FromCents(cfg.Reward.MaxCents),
	}, nil
}
