import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve } from 'path'

/**
 * Builds the home page into one self-contained HTML file that opens straight from disk
 * (no backend, no server), for sending design previews.
 * Usage: pnpm build:preview  ->  dist-preview/preview/home.html
 */
export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  publicDir: false,
  resolve: {
    alias: [
      // i18n's setLocale imports the app router; point it at the preview router so the full app stays out of the file.
      { find: /^@\/router$/, replacement: resolve(__dirname, 'src/preview/previewRouter.ts') },
      { find: '@', replacement: resolve(__dirname, 'src') },
      // Same runtime-only vue-i18n build as the main app (CSP safe, no eval).
      { find: 'vue-i18n', replacement: 'vue-i18n/dist/vue-i18n.runtime.esm-bundler.js' },
    ],
  },
  define: {
    __INTLIFY_JIT_COMPILATION__: true,
  },
  build: {
    outDir: 'dist-preview',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'preview/home.html'),
    },
  },
})
