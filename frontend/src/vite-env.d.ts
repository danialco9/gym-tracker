/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" shows the "Probar la demo" button on the login page. */
  readonly VITE_DEMO_ENABLED?: string
  /** Set at build time from the Sentry integration's SENTRY_DSN (see vite.config.ts); empty sends nothing. */
  readonly VITE_SENTRY_DSN?: string
  /** Vercel's VERCEL_ENV at build time: production, preview or development. */
  readonly VITE_SENTRY_ENVIRONMENT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
