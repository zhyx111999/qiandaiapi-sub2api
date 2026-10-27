// Package httpapi exposes the check-in service with the official backend's
// response envelope, so the console's API client treats it like any other call.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"yezi/checkin/internal/checkin"
	"yezi/checkin/internal/sub2api"
)

// Pinger reports whether the database is reachable.
type Pinger interface {
	Ping(ctx context.Context) error
}

type handler struct {
	svc    *checkin.Service
	db     Pinger
	logger *slog.Logger
}

// New returns the HTTP routes:
//
//	GET  /api/v1/ext/checkin/status    caller's state for today
//	POST /api/v1/ext/checkin           check in
//	PUT  /api/v1/ext/checkin/settings  site-wide settings (admins)
//	GET  /healthz                      liveness incl. database
func New(svc *checkin.Service, db Pinger, logger *slog.Logger) http.Handler {
	h := &handler{svc: svc, db: db, logger: logger}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/ext/checkin/status", h.status)
	mux.HandleFunc("POST /api/v1/ext/checkin", h.checkIn)
	mux.HandleFunc("PUT /api/v1/ext/checkin/settings", h.updateSettings)
	mux.HandleFunc("GET /healthz", h.health)
	return mux
}

func (h *handler) status(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.Status(r.Context(), r.Header)
	h.reply(w, r, result, err)
}

func (h *handler) checkIn(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.CheckIn(r.Context(), r.Header)
	h.reply(w, r, result, err)
}

func (h *handler) updateSettings(w http.ResponseWriter, r *http.Request) {
	var in checkin.Settings
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&in); err != nil {
		write(w, http.StatusBadRequest, envelope{Code: http.StatusBadRequest, Message: "invalid request body", Reason: "CHECKIN_BAD_REQUEST"})
		return
	}
	result, err := h.svc.UpdateSettings(r.Context(), r.Header, in)
	h.reply(w, r, result, err)
}

func (h *handler) health(w http.ResponseWriter, r *http.Request) {
	if err := h.db.Ping(r.Context()); err != nil {
		write(w, http.StatusServiceUnavailable, envelope{Code: http.StatusServiceUnavailable, Message: "database unavailable"})
		return
	}
	write(w, http.StatusOK, envelope{Code: 0, Message: "success"})
}

type envelope struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Reason  string `json:"reason,omitempty"`
	Data    any    `json:"data,omitempty"`
}

func (h *handler) reply(w http.ResponseWriter, r *http.Request, data any, err error) {
	if err == nil {
		write(w, http.StatusOK, envelope{Code: 0, Message: "success", Data: data})
		return
	}
	status, body := failure(err)
	if status >= http.StatusInternalServerError {
		h.logger.Error("check-in request failed", "method", r.Method, "path", r.URL.Path, "status", status, "err", err)
	}
	writeRaw(w, status, body)
}

// failure maps an error to a status and JSON body. Check-in errors come first:
// a credit failure wraps the backend error but must not reuse its status.
// Other backend errors (e.g. an expired session) are relayed byte for byte.
func failure(err error) (int, []byte) {
	var ce *checkin.Error
	if errors.As(err, &ce) {
		return ce.Status, encode(envelope{Code: ce.Status, Message: ce.Message, Reason: ce.Reason})
	}
	var ae *sub2api.APIError
	if errors.As(err, &ae) {
		return ae.Status, ae.Body
	}
	return http.StatusInternalServerError, encode(envelope{Code: http.StatusInternalServerError, Message: "internal error", Reason: "CHECKIN_INTERNAL"})
}

func encode(body envelope) []byte {
	raw, _ := json.Marshal(body)
	return raw
}

func write(w http.ResponseWriter, status int, body envelope) {
	writeRaw(w, status, encode(body))
}

func writeRaw(w http.ResponseWriter, status int, body []byte) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
