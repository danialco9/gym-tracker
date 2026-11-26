import * as Sentry from '@sentry/react'

/**
 * Errors that break the app on someone's phone go to Sentry, with the technical detail and
 * nothing personal. Only switched on when the build has a DSN (on Vercel, `SENTRY_DSN` comes from
 * the Sentry integration), so local development and the tests send nothing.
 */

// Nothing that identifies a person or their training: no user, cookies, bodies (passwords, sets
// and measurements travel there) or query strings. Of the headers, only the device and language.
export const DATA_COLLECTION: Sentry.BrowserOptions['dataCollection'] = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ['user-agent', 'accept-language'] }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  stackFrameVariables: false,
}

export function initErrorReporting(
  dsn: string | undefined,
  options: Pick<Sentry.BrowserOptions, 'environment' | 'transport'> = {},
): boolean {
  if (!dsn) return false
  Sentry.init({
    dsn,
    environment: options.environment,
    transport: options.transport,
    dataCollection: DATA_COLLECTION,
    // Errors only: no performance tracing or session replays, which would use up the free plan
    // (and a replay would record what is on screen).
    tracesSampleRate: undefined,
    // Console messages may carry anything the app logged; clicks and navigation are enough.
    integrations: (defaults) => defaults.filter((integration) => integration.name !== 'Console'),
  })
  return true
}

/** For errors the app catches itself (a screen that failed to render), which never reach the global handlers. */
export function reportError(error: unknown) {
  Sentry.captureException(error)
}

/** For React's `createRoot`: errors no error boundary caught. */
export const reportUncaughtReactError = Sentry.reactErrorHandler()
