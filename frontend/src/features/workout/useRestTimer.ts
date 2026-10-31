import { useCallback, useEffect, useState } from 'react'

export const DEFAULT_REST_SECONDS = 90
// How long "time's up" stays on screen once the countdown runs out by itself.
export const READY_SECONDS = 5

/** Countdown based on an absolute end time, so it stays accurate if the tab is throttled. */
export function useRestTimer() {
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)
  // The whole rest including time added or taken off, so a ring can show the share left.
  const [duration, setDuration] = useState(0)
  // The rest ran out on its own (not cut short): a short "go" before the bar goes away.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (endsAt === null) {
      return
    }
    const tick = () => {
      const secondsLeft = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      setRemaining(secondsLeft)
      if (secondsLeft === 0) {
        setEndsAt(null)
        setReady(true)
        navigator.vibrate?.([200, 100, 200])
      }
    }
    tick()
    const interval = window.setInterval(tick, 250)
    return () => window.clearInterval(interval)
  }, [endsAt])

  useEffect(() => {
    if (!ready) {
      return
    }
    const timeout = window.setTimeout(() => setReady(false), READY_SECONDS * 1000)
    return () => window.clearTimeout(timeout)
  }, [ready])

  const start = useCallback((seconds: number = DEFAULT_REST_SECONDS) => {
    setEndsAt(Date.now() + seconds * 1000)
    setDuration(seconds)
    setReady(false)
  }, [])

  /** Negative to take time off; taking off more than is left ends the rest. */
  const addSeconds = useCallback((seconds: number) => {
    setEndsAt((current) => (current === null ? null : current + seconds * 1000))
    setDuration((current) => Math.max(0, current + seconds))
  }, [])

  const stop = useCallback(() => {
    setEndsAt(null)
    setRemaining(0)
    setReady(false)
  }, [])

  return { remaining, duration, endsAt, isRunning: endsAt !== null, ready, start, addSeconds, stop }
}
