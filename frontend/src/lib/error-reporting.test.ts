import * as Sentry from '@sentry/react'
import { afterEach, describe, expect, it } from 'vitest'
import { initErrorReporting, reportError } from '@/lib/error-reporting'

type SentryEvent = Record<string, any>

/** Keeps the error events in memory instead of sending them to Sentry. */
function capturedEvents() {
  const events: SentryEvent[] = []
  const transport: Sentry.BrowserOptions['transport'] = (options) =>
    Sentry.createTransport(options, async (request) => {
      const body = typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body)
      // An envelope: a header line, then each item as a header line and a payload line.
      const lines = body.split('\n')
      for (let index = 1; index < lines.length - 1; index += 2) {
        if (JSON.parse(lines[index]).type === 'event') events.push(JSON.parse(lines[index + 1]))
      }
      return { statusCode: 200 }
    })
  return { events, transport }
}

describe('error reporting', () => {
  afterEach(async () => {
    await Sentry.close()
    document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    window.history.replaceState(null, '', '/')
  })

  it('reports nothing without a DSN', () => {
    expect(initErrorReporting(undefined)).toBe(false)
    expect(initErrorReporting('')).toBe(false)
  })

  it('reports an error without personal data', async () => {
    const { events, transport } = capturedEvents()
    expect(
      initErrorReporting('https://public@sentry.example.invalid/1', { environment: 'preview', transport }),
    ).toBe(true)
    document.cookie = 'session=a-session-token'
    window.history.replaceState(null, '', '/entreno?email=dani@example.com')
    console.log('Press banca: 140 kg')

    reportError(new RangeError('could not draw the set of 140 kg'))
    await Sentry.flush()

    expect(events).toHaveLength(1)
    const [event] = events
    expect(event.environment).toBe('preview')
    expect(event.exception.values[0].type).toBe('RangeError')

    // Where it happened, but not the query string; the device, but no cookie.
    expect(event.request.url).toBe('http://localhost:3000/entreno')
    expect(JSON.stringify(event.request)).not.toContain('dani@example.com')
    expect(JSON.stringify(event)).not.toContain('a-session-token')
    expect(event.request.cookies).toBeUndefined()
    expect(event.user).toBeUndefined()
    // What the app wrote to the console stays on the phone.
    expect(JSON.stringify(event.breadcrumbs ?? [])).not.toContain('140 kg')
  })
})
