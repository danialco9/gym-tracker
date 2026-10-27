import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api'

/**
 * "Descanso terminado" on the lock screen. A locked iPhone freezes the app, so the API times the
 * rest and sends a Web Push when it is over (iOS 16.4+, with the app added to the home screen).
 */

export const REST_PUSH_STORAGE_KEY = 'gym-tracker:rest-push:v1'
// The API waits out the rest within one request, and the server stops requests at 300 s.
export const MAX_PUSH_REST_SECONDS = 290

export type RestPushStatus = 'unsupported' | 'denied' | 'off' | 'on'

function isSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function readStatus(): RestPushStatus {
  if (!isSupported()) {
    return 'unsupported'
  }
  if (Notification.permission === 'denied') {
    return 'denied'
  }
  try {
    const chosen = window.localStorage.getItem(REST_PUSH_STORAGE_KEY) === 'on'
    return chosen && Notification.permission === 'granted' ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

/** The VAPID public key comes base64url-encoded; the browser wants the raw bytes. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replaceAll('-', '+').replaceAll('_', '/')
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

/** Asks for permission and registers this phone. Must run straight from a tap, or iOS refuses. */
async function subscribe(): Promise<boolean> {
  if ((await Notification.requestPermission()) !== 'granted') {
    return false
  }
  const { public_key } = await apiFetch<{ public_key: string }>('/push/public-key')
  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(public_key),
    }))
  await apiFetch('/push/subscription', { method: 'PUT', body: subscription.toJSON() })
  return true
}

/**
 * Plain fetch rather than the query client: the request stays open for the whole rest, and the
 * phone is usually locked before it answers. A failure only means no notification this time.
 */
async function scheduleRest(seconds: number, body: string): Promise<void> {
  const subscription = await currentSubscription()
  if (subscription === null) {
    return
  }
  await fetch('/api/push/rest', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint, seconds, body }),
  }).catch(() => undefined)
}

async function cancelRest(): Promise<void> {
  const subscription = await currentSubscription()
  if (subscription === null) {
    return
  }
  const endpoint = encodeURIComponent(subscription.endpoint)
  await fetch(`/api/push/rest?endpoint=${endpoint}`, { method: 'DELETE', credentials: 'same-origin' }).catch(
    () => undefined,
  )
}

/** Whether this phone gets the notification, and the tap that turns it on. */
export function useRestPushSetting() {
  const [status, setStatus] = useState<RestPushStatus>(readStatus)

  const enable = useCallback(async () => {
    const granted = await subscribe()
    if (granted) {
      try {
        window.localStorage.setItem(REST_PUSH_STORAGE_KEY, 'on')
      } catch {
        // Private browsing: it stays on until the app is closed.
      }
    }
    setStatus(granted ? 'on' : readStatus())
  }, [])

  return { status, enable }
}

/**
 * Times the notification for the running rest: again whenever its end moves (more or less time),
 * and cancelled when the rest is cut short. ``body`` says what comes next.
 */
export function useRestNotification(endsAt: number | null, body: string | null, status: RestPushStatus) {
  const scheduled = useRef(false)
  // Read when the rest starts or moves; editing the next set mid-rest does not reschedule it.
  const latestBody = useRef(body)
  useEffect(() => {
    latestBody.current = body
  }, [body])

  useEffect(() => {
    if (status !== 'on' || endsAt === null || latestBody.current === null) {
      return
    }
    const seconds = Math.ceil((endsAt - Date.now()) / 1000)
    if (seconds < 1) {
      return
    }
    scheduled.current = true
    // A newer rest replaces the one waiting on the server, so there is nothing to cancel here.
    void scheduleRest(Math.min(seconds, MAX_PUSH_REST_SECONDS), latestBody.current)
  }, [endsAt, status])

  useEffect(() => {
    if (endsAt === null && scheduled.current) {
      scheduled.current = false
      void cancelRest()
    }
  }, [endsAt])
}
