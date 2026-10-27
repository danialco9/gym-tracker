import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { base64UrlToBytes, useRestNotification, type RestPushStatus } from './rest-push'

const ENDPOINT = 'https://web.push.apple.com/QGuQyavXutnMH2'
const NEXT = 'Press banca · serie 2 · 8 × 80 kg'
const NOW = new Date('2026-10-27T18:00:00Z').getTime()

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

/** What the hook sent to the API, as "METHOD path" plus the JSON body. */
function requests(): [string, unknown][] {
  return fetchMock.mock.calls.map(([url, init]) => [
    `${init?.method} ${String(url)}`,
    typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  ])
}

function renderRest(endsAt: number | null, status: RestPushStatus = 'on') {
  return renderHook(
    ({ endsAt, status }: { endsAt: number | null; status: RestPushStatus }) =>
      useRestNotification(endsAt, NEXT, status),
    { initialProps: { endsAt, status } },
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  const pushManager = { getSubscription: () => Promise.resolve({ endpoint: ENDPOINT }) }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useRestNotification', () => {
  it('asks the API to notify when the rest is over, with the next set', async () => {
    renderRest(NOW + 90_000)

    await waitFor(() =>
      expect(requests()).toEqual([['POST /api/push/rest', { endpoint: ENDPOINT, seconds: 90, body: NEXT }]]),
    )
  })

  it('times it again when the rest gets longer, and cancels it when cut short', async () => {
    const { rerender } = renderRest(NOW + 90_000)
    await waitFor(() => expect(requests()).toHaveLength(1))

    rerender({ endsAt: NOW + 120_000, status: 'on' })
    await waitFor(() => expect(requests()).toHaveLength(2))
    rerender({ endsAt: null, status: 'on' })

    await waitFor(() =>
      expect(requests().slice(1)).toEqual([
        ['POST /api/push/rest', { endpoint: ENDPOINT, seconds: 120, body: NEXT }],
        [`DELETE /api/push/rest?endpoint=${encodeURIComponent(ENDPOINT)}`, undefined],
      ]),
    )
  })

  it('notifies a little early rather than never when the rest outlasts what the server can wait', async () => {
    renderRest(NOW + 400_000)

    await waitFor(() =>
      expect(requests()).toEqual([['POST /api/push/rest', expect.objectContaining({ seconds: 290 })]]),
    )
  })

  it('sends nothing while the notification is off', async () => {
    const { rerender } = renderRest(NOW + 90_000, 'off')
    rerender({ endsAt: null, status: 'off' })

    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('times the running rest as soon as the notification is turned on', async () => {
    const { rerender } = renderRest(NOW + 90_000, 'off')
    vi.setSystemTime(NOW + 10_000)

    rerender({ endsAt: NOW + 90_000, status: 'on' })

    await waitFor(() =>
      expect(requests()).toEqual([['POST /api/push/rest', expect.objectContaining({ seconds: 80 })]]),
    )
  })
})

describe('base64UrlToBytes', () => {
  it('decodes the unpadded url-safe alphabet of VAPID keys', () => {
    expect(Array.from(base64UrlToBytes('-_8'))).toEqual([0xfb, 0xff])
    expect(Array.from(base64UrlToBytes('AQID'))).toEqual([1, 2, 3])
  })
})
