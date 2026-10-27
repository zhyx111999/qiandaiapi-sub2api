// Package sub2api reaches the official backend through its public HTTP API
// only, so the check-in sidecar never depends on the backend's internals and
// the official image can be upgraded on its own.
package sub2api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Identity is the signed-in user as reported by the official backend.
type Identity struct {
	ID      int64   `json:"id"`
	Role    string  `json:"role"`
	Balance float64 `json:"balance"`
}

// IsAdmin reports whether the user holds the official admin role.
func (i Identity) IsAdmin() bool { return i.Role == "admin" }

// APIError is a non-success answer from the official backend. It keeps the
// original status and body (whose "code" may be a number or a string) so it
// can be relayed to the browser unchanged; a 401 there drives the console's
// normal token refresh.
type APIError struct {
	Status int
	Body   []byte
}

func (e *APIError) Error() string {
	body := e.Body
	if len(body) > 200 {
		body = body[:200]
	}
	return fmt.Sprintf("sub2api: HTTP %d: %s", e.Status, body)
}

// Client calls the official backend.
type Client struct {
	baseURL  string
	adminKey string
	http     *http.Client
}

// New returns a client for the backend at baseURL. adminKey is the official
// Admin API Key (system settings), used only for balance credits.
func New(baseURL, adminKey string) *Client {
	return &Client{
		baseURL:  strings.TrimRight(baseURL, "/"),
		adminKey: adminKey,
		http:     &http.Client{Timeout: 15 * time.Second},
	}
}

// Identify resolves the caller from the request headers they sent: their own
// Authorization plus the proxy's client-address headers.
func (c *Client) Identify(ctx context.Context, from http.Header) (Identity, error) {
	var who Identity
	err := c.do(ctx, http.MethodGet, "/api/v1/user/profile", nil, func(h http.Header) {
		for _, name := range []string{"Authorization", "X-Real-IP", "X-Forwarded-For", "X-Forwarded-Proto"} {
			if value := from.Get(name); value != "" {
				h.Set(name, value)
			}
		}
	}, &who)
	return who, err
}

// Credit adds amount to the user's balance through the official admin balance
// API, which also invalidates caches and writes the balance history entry.
// The idempotency key turns a retried credit for the same check-in into a
// replay instead of a second payment. It returns the new balance.
func (c *Client) Credit(ctx context.Context, userID int64, amount float64, notes, idempotencyKey string) (float64, error) {
	body := map[string]any{"balance": amount, "operation": "add", "notes": notes}
	var user Identity
	err := c.do(ctx, http.MethodPost, fmt.Sprintf("/api/v1/admin/users/%d/balance", userID), body, func(h http.Header) {
		h.Set("x-api-key", c.adminKey)
		h.Set("Idempotency-Key", idempotencyKey)
	}, &user)
	return user.Balance, err
}

type envelope struct {
	Code json.RawMessage `json:"code"`
	Data json.RawMessage `json:"data"`
}

func (c *Client) do(ctx context.Context, method, path string, body any, headers func(http.Header), out any) error {
	var payload io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		payload = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, payload)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	headers(req.Header)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("sub2api %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return fmt.Errorf("sub2api %s %s: read body: %w", method, path, err)
	}
	if resp.StatusCode != http.StatusOK {
		return &APIError{Status: resp.StatusCode, Body: raw}
	}
	var env envelope
	if err := json.Unmarshal(raw, &env); err != nil || string(env.Code) != "0" {
		return &APIError{Status: http.StatusBadGateway, Body: raw}
	}
	return json.Unmarshal(env.Data, out)
}
