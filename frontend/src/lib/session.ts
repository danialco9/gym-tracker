import { z } from 'zod'
import type { User } from './types'

/** Query key of the signed-in user (`null` when signed out). */
export const currentUserQueryKey = ['auth', 'me'] as const

export const SESSION_STORAGE_KEY = 'gym-tracker:session:v1'

const userSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  // Users cached before goals existed have none: they read as not chosen yet.
  goal: z.enum(['lose_fat', 'build_muscle', 'recomposition']).nullable().catch(null),
  created_at: z.string(),
})

/**
 * The last user the server confirmed. It is a convenience for a phone with no connection, never a
 * permission: the session cookie is what actually authorises a request, and the first call made
 * once the connection returns ends the session if that cookie is gone.
 */
export function loadCachedUser(storage?: Storage): User | null {
  try {
    const raw = (storage ?? window.localStorage).getItem(SESSION_STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = userSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function saveCachedUser(user: User | null, storage?: Storage): void {
  try {
    const target = storage ?? window.localStorage
    if (user === null) {
      target.removeItem(SESSION_STORAGE_KEY)
    } else {
      target.setItem(SESSION_STORAGE_KEY, JSON.stringify(user))
    }
  } catch {
    // Storage can be unavailable (private mode, quota): the app then just needs the network.
  }
}
