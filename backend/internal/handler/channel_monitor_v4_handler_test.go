package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type channelMonitorViewStoreStub struct {
	view service.ChannelMonitorView
	err  error
	set  []string
}

func (s *channelMonitorViewStoreStub) ChannelMonitorView(context.Context) (service.ChannelMonitorView, error) {
	return s.view, s.err
}

func (s *channelMonitorViewStoreStub) SetChannelMonitorView(_ context.Context, view string) (service.ChannelMonitorView, error) {
	s.set = append(s.set, view)
	if s.err != nil {
		return service.ChannelMonitorView{}, s.err
	}
	s.view.View = view
	return s.view, nil
}

func channelMonitorV4Request(t *testing.T, store *channelMonitorViewStoreStub, method, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	h := &ChannelMonitorV4Handler{views: store}
	router := gin.New()
	router.GET("/view", h.View)
	router.PUT("/view", h.SetView)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(method, "/view", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(rec, req)
	return rec
}

func TestChannelMonitorV4HandlerReportsView(t *testing.T) {
	store := &channelMonitorViewStoreStub{view: service.ChannelMonitorView{View: "v4"}}
	rec := channelMonitorV4Request(t, store, http.MethodGet, "")
	require.Equal(t, http.StatusOK, rec.Code)
	require.JSONEq(t, `{"code":0,"message":"success","data":{"view":"v4"}}`, rec.Body.String())
}

func TestChannelMonitorV4HandlerSwitchesView(t *testing.T) {
	store := &channelMonitorViewStoreStub{view: service.ChannelMonitorView{View: "v1"}}
	rec := channelMonitorV4Request(t, store, http.MethodPut, `{"view":"v4"}`)
	require.Equal(t, http.StatusOK, rec.Code)
	require.JSONEq(t, `{"code":0,"message":"success","data":{"view":"v4"}}`, rec.Body.String())
	require.Equal(t, []string{"v4"}, store.set)
}

func TestChannelMonitorV4HandlerRejectsBadRequests(t *testing.T) {
	store := &channelMonitorViewStoreStub{err: service.ErrChannelMonitorInvalidMode}
	require.Equal(t, http.StatusBadRequest, channelMonitorV4Request(t, store, http.MethodPut, `{"view":`).Code)
	require.Empty(t, store.set, "an unparsable body never reaches the service")
	require.Equal(t, http.StatusBadRequest, channelMonitorV4Request(t, store, http.MethodPut, `{"view":"v9"}`).Code)
	require.Equal(t, []string{"v9"}, store.set)
}
