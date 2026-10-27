package sub2api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestIdentifyRelaysBackendErrorsVerbatim(t *testing.T) {
	// The official JWT middleware answers with a string code.
	const body = `{"code":"UNAUTHORIZED","message":"Authorization header is required"}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	_, err := New(srv.URL, "key").Identify(context.Background(), http.Header{})
	var apiErr *APIError
	if !errors.As(err, &apiErr) || apiErr.Status != http.StatusUnauthorized || string(apiErr.Body) != body {
		t.Fatalf("Identify error = %v, want the verbatim 401", err)
	}
}

func TestIdentifyForwardsCallerHeaders(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/user/profile" || r.Header.Get("Authorization") != "Bearer user" || r.Header.Get("X-Real-IP") != "203.0.113.9" {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"code":400,"message":"unexpected request"}`))
			return
		}
		_, _ = w.Write([]byte(`{"code":0,"message":"success","data":{"id":7,"role":"user","balance":10.5}}`))
	}))
	defer srv.Close()

	from := http.Header{}
	from.Set("Authorization", "Bearer user")
	from.Set("X-Real-IP", "203.0.113.9")
	who, err := New(srv.URL, "key").Identify(context.Background(), from)
	if err != nil {
		t.Fatal(err)
	}
	if who != (Identity{ID: 7, Role: "user", Balance: 10.5}) || who.IsAdmin() {
		t.Fatalf("identity = %+v", who)
	}
}

func TestCreditUsesAdminKeyAndIdempotencyKey(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var in map[string]any
		_ = json.NewDecoder(r.Body).Decode(&in)
		ok := r.Method == http.MethodPost &&
			r.URL.Path == "/api/v1/admin/users/7/balance" &&
			r.Header.Get("x-api-key") == "admin-key" &&
			r.Header.Get("Idempotency-Key") == "yezi-checkin-7-2026-10-27" &&
			r.Header.Get("Authorization") == "" &&
			in["operation"] == "add" && in["balance"] == 3.42 && in["notes"] == "每日签到 2026-10-27"
		if !ok {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"code":400,"message":"unexpected request"}`))
			return
		}
		_, _ = w.Write([]byte(`{"code":0,"message":"success","data":{"id":7,"role":"user","balance":13.92}}`))
	}))
	defer srv.Close()

	balance, err := New(srv.URL, "admin-key").Credit(context.Background(), 7, 3.42, "每日签到 2026-10-27", "yezi-checkin-7-2026-10-27")
	if err != nil || balance != 13.92 {
		t.Fatalf("Credit = %v, %v", balance, err)
	}
}
