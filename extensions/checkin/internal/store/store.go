// Package store keeps the check-in configuration and daily records in the
// sidecar's own PostgreSQL schema. The official tables are never touched.
package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"yezi/checkin/internal/reward"
)

const schema = `
CREATE SCHEMA IF NOT EXISTS yezi_checkin;

CREATE TABLE IF NOT EXISTS yezi_checkin.config (
	id         smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
	enabled    boolean     NOT NULL DEFAULT false,
	min_cents  bigint      NOT NULL DEFAULT 300,
	max_cents  bigint      NOT NULL DEFAULT 500,
	updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO yezi_checkin.config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS yezi_checkin.records (
	user_id      bigint      NOT NULL,
	day          text        NOT NULL,
	amount_cents bigint      NOT NULL,
	credited     boolean     NOT NULL DEFAULT false,
	created_at   timestamptz NOT NULL DEFAULT now(),
	credited_at  timestamptz,
	PRIMARY KEY (user_id, day)
);`

// Config is the site-wide check-in configuration.
type Config struct {
	Enabled bool
	Reward  reward.Range
}

// Record is one user's check-in for one day. Credited stays false until the
// official backend has confirmed the balance change.
type Record struct {
	AmountCents int64
	Credited    bool
}

// Store is the PostgreSQL-backed check-in store.
type Store struct {
	pool *pgxpool.Pool
}

// Open connects using the standard PG* environment variables and creates the
// schema on first start.
func Open(ctx context.Context) (*Store, error) {
	pool, err := pgxpool.New(ctx, "")
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	if _, err := pool.Exec(ctx, schema); err != nil {
		pool.Close()
		return nil, fmt.Errorf("init schema: %w", err)
	}
	return &Store{pool: pool}, nil
}

// Close releases the connection pool.
func (s *Store) Close() { s.pool.Close() }

// Ping checks the database connection.
func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

// Config returns the current configuration.
func (s *Store) Config(ctx context.Context) (Config, error) {
	var c Config
	err := s.pool.QueryRow(ctx,
		`SELECT enabled, min_cents, max_cents FROM yezi_checkin.config WHERE id = 1`,
	).Scan(&c.Enabled, &c.Reward.MinCents, &c.Reward.MaxCents)
	return c, err
}

// SaveConfig replaces the configuration.
func (s *Store) SaveConfig(ctx context.Context, c Config) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE yezi_checkin.config SET enabled = $1, min_cents = $2, max_cents = $3, updated_at = now() WHERE id = 1`,
		c.Enabled, c.Reward.MinCents, c.Reward.MaxCents,
	)
	return err
}

// Find returns the user's record for day, or nil if there is none.
func (s *Store) Find(ctx context.Context, userID int64, day string) (*Record, error) {
	var r Record
	err := s.pool.QueryRow(ctx,
		`SELECT amount_cents, credited FROM yezi_checkin.records WHERE user_id = $1 AND day = $2`,
		userID, day,
	).Scan(&r.AmountCents, &r.Credited)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// Claim reserves the user's check-in for day with amountCents. When the day is
// already claimed the existing record wins, so a retry credits the same amount.
func (s *Store) Claim(ctx context.Context, userID int64, day string, amountCents int64) (Record, error) {
	var r Record
	err := s.pool.QueryRow(ctx, `
		INSERT INTO yezi_checkin.records (user_id, day, amount_cents) VALUES ($1, $2, $3)
		ON CONFLICT (user_id, day) DO UPDATE SET user_id = EXCLUDED.user_id
		RETURNING amount_cents, credited`,
		userID, day, amountCents,
	).Scan(&r.AmountCents, &r.Credited)
	return r, err
}

// MarkCredited records that the official backend confirmed the credit.
func (s *Store) MarkCredited(ctx context.Context, userID int64, day string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE yezi_checkin.records SET credited = true, credited_at = now() WHERE user_id = $1 AND day = $2`,
		userID, day,
	)
	return err
}
