import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { useCurrentUser } from '@/features/auth/queries'
import { planKeys } from '@/features/plan/queries'
import { progressKeys } from '@/features/progress/queries'
import { plural } from '@/lib/format'
import { useOnline } from '@/lib/online'
import { flushOutbox, loadOutbox, subscribeOutbox, type QueuedWorkout } from './outbox'
import { queryKeys } from './queries'

const RETRY_INTERVAL_MS = 30_000
const NO_ITEMS: QueuedWorkout[] = []

/** The signed-in user's queued workouts, re-rendering whenever the queue changes. */
export function useOutbox(): QueuedWorkout[] {
  const userId = useCurrentUser().data?.id
  const items = useSyncExternalStore(subscribeOutbox, loadOutbox, () => NO_ITEMS)
  return userId === undefined ? NO_ITEMS : items.filter((item) => item.userId === userId)
}

/**
 * Sends the queued workouts whenever there is a chance they get through: when the app opens, when
 * the connection returns, when something new is queued, and every half a minute while any wait.
 * The `online` event alone is not enough: a phone on the gym's wifi can be "online" long before
 * the wifi actually reaches anything.
 */
export function useOutboxSync(): void {
  const queryClient = useQueryClient()
  const userId = useCurrentUser().data?.id
  const online = useOnline()
  const waiting = useOutbox().filter((item) => !item.rejected).length
  const flushing = useRef(false)

  const flush = useCallback(async () => {
    if (userId === undefined || flushing.current) return
    flushing.current = true
    try {
      const { sent, rejected } = await flushOutbox(userId)
      if (sent > 0) {
        toast.success(`${sent} ${plural(sent, 'entreno subido', 'entrenos subidos')} al volver la conexión`)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.workouts }),
          queryClient.invalidateQueries({ queryKey: queryKeys.exercises }),
          queryClient.invalidateQueries({ queryKey: progressKeys.all }),
          // The week plan marks the days trained.
          queryClient.invalidateQueries({ queryKey: planKeys.all }),
        ])
      }
      if (rejected > 0) {
        toast.error('Un entreno pendiente no se pudo subir. Lo tienes en Inicio para revisarlo.')
      }
    } finally {
      flushing.current = false
    }
  }, [queryClient, userId])

  useEffect(() => {
    if (online && waiting > 0) {
      void flush()
    }
  }, [flush, online, waiting])

  useEffect(() => {
    if (waiting === 0) return
    const timer = window.setInterval(() => void flush(), RETRY_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [flush, waiting])
}
