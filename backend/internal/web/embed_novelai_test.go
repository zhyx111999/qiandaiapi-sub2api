//go:build embed

package web

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// The NovelAI native image endpoints sit at the root, where NovelAI clients call them; the embedded frontend
// must not answer them with index.html.
func TestEmbeddedFrontendBypassesNovelAINativeRoutes(t *testing.T) {
	for _, path := range []string{"/ai/generate-image", "/ai/generate-image-stream", "/ai/encode-vibe"} {
		require.True(t, shouldBypassEmbeddedFrontend(path), "path=%s", path)
	}
}
