/// <reference types="vitest/config" />
import path from 'node:path'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// On Vercel the Sentry integration sets these. With its auth token the build uploads source maps,
// so the errors point at the real code, and deletes them so they are never served. Without it
// (local builds, CI) nothing changes.
const sentryUpload = Boolean(process.env.SENTRY_AUTH_TOKEN)

// https://vite.dev/config/
export default defineConfig({
  // Only the DSN, which is public by design, and the environment reach the browser; the
  // integration's other SENTRY_ variables (the auth token among them) stay in the build.
  define: {
    'import.meta.env.VITE_SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN ?? ''),
    'import.meta.env.VITE_SENTRY_ENVIRONMENT': JSON.stringify(process.env.VERCEL_ENV ?? 'development'),
  },
  build: {
    sourcemap: sentryUpload ? 'hidden' : false,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The gym is the worst possible network, so the app shell is precached and served from the
      // service worker: it opens with no connection at all. Only the shell — the API is never
      // cached, since a stale workout or a stale set is worse than an honest error.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Gym Tracker',
        short_name: 'Gym Tracker',
        description: 'Registro de entrenamientos y análisis de rendimiento',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0d10',
        theme_color: '#0b0d10',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        // Exercise drawings are not part of the shell: each one is cached the first time it is shown.
        globIgnores: ['exercise-art/**'],
        // The end-of-rest notification: shown, and opened, by the service worker.
        importScripts: ['/push-sw.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/exercise-art/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-art',
              expiration: { maxEntries: 400 },
            },
          },
        ],
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        // A navigation to /api must reach the network, not the cached shell.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
    sentryVitePlugin({
      disable: !sentryUpload,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      // The release goes in index.html, not in the chunks, so their file names (and the cached
      // copies on the phone) only change when their code does.
      release: { name: process.env.VERCEL_GIT_COMMIT_SHA, inject: 'html' },
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      // A failed upload costs readable stack traces, never a deployment.
      errorHandler: (error) => console.warn(error),
      telemetry: false,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // Same-origin API calls keep the auth cookie first-party (SameSite=Lax).
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
