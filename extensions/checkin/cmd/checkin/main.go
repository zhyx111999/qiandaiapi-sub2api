// Command checkin is the Yezi daily check-in sidecar. It runs next to the
// unmodified Sub2API backend, talks to it over the public HTTP API only and
// keeps its own data in the yezi_checkin schema.
//
// Environment:
//
//	SUB2API_ADMIN_API_KEY  official Admin API Key (required)
//	SUB2API_URL            backend base URL (default http://sub2api:8080)
//	LISTEN_ADDR            listen address (default :8080)
//	PGHOST, PGUSER, ...    standard PostgreSQL connection variables
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"yezi/checkin/internal/checkin"
	"yezi/checkin/internal/httpapi"
	"yezi/checkin/internal/store"
	"yezi/checkin/internal/sub2api"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("check-in sidecar stopped", "err", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	adminKey := os.Getenv("SUB2API_ADMIN_API_KEY")
	if adminKey == "" {
		return errors.New("SUB2API_ADMIN_API_KEY is required")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	st, err := store.Open(ctx)
	if err != nil {
		return err
	}
	defer st.Close()

	backend := sub2api.New(envOr("SUB2API_URL", "http://sub2api:8080"), adminKey)
	svc := checkin.NewService(st, backend, time.Now)
	srv := &http.Server{
		Addr:              envOr("LISTEN_ADDR", ":8080"),
		Handler:           httpapi.New(svc, st, logger),
		ReadHeaderTimeout: 10 * time.Second,
	}

	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.ListenAndServe() }()
	logger.Info("check-in sidecar listening", "addr", srv.Addr)

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
