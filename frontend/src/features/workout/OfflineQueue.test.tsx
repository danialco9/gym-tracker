import { act, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { User, WorkoutIn } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'
import { DRAFT_STORAGE_KEY, type WorkoutDraft } from './draft'
import { OUTBOX_STORAGE_KEY, type QueuedWorkout } from './outbox'

const USER: User = {
  id: 1,
  email: 'dani@example.com',
  goal: null,
  nickname: null,
  show_in_ranking: true,
  created_at: '2026-09-15T10:00:00Z',
}
const CLIENT_ID = '8f14e45f-ceea-467a-9575-0e1f3c9b7a01'

const DRAFT: WorkoutDraft = {
  clientId: CLIENT_ID,
  routineId: null,
  routineName: null,
  startedAt: '2026-09-15T16:00:00.000Z',
  notes: '',
  exercises: [
    {
      id: 'entry-1',
      exerciseId: 5,
      name: 'Prensa de piernas',
      targets: [],
      sets: [{ id: 'set-1', reps: 12, weightKg: 110, rpe: null, isWarmup: false, done: true }],
    },
  ],
}

function queued(userId: number, clientId: string): QueuedWorkout {
  const payload: WorkoutIn & { client_id: string } = {
    client_id: clientId,
    routine_id: null,
    started_at: '2026-09-15T16:00:00.000Z',
    ended_at: '2026-09-15T17:00:00.000Z',
    notes: null,
    sets: [{ exercise_id: 5, set_number: 1, reps: 12, weight_kg: 110, rpe: null, is_warmup: false }],
  }
  return { userId, queuedAt: '2026-09-15T17:00:00.000Z', rejected: false, payload }
}

/** What the phone reports about its connection, switchable mid-test like the real `online` event. */
function connection(initiallyOnline: boolean) {
  let online = initiallyOnline
  vi.spyOn(Navigator.prototype, 'onLine', 'get').mockImplementation(() => online)
  return {
    get online() {
      return online
    },
    restore() {
      online = true
      act(() => {
        window.dispatchEvent(new Event('online'))
      })
    },
  }
}

const storedOutbox = (): QueuedWorkout[] =>
  JSON.parse(window.localStorage.getItem(OUTBOX_STORAGE_KEY) ?? '[]') as QueuedWorkout[]

describe('Offline queue', () => {
  it('keeps a workout finished without coverage and sends it when the connection returns', async () => {
    const phone = connection(false)
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(DRAFT))
    const calls = mockApi({
      'GET /auth/me': { body: USER },
      'POST /workouts': () => (phone.online ? { status: 201, body: { id: 99 } } : { networkError: true }),
      'GET /workouts?limit=5': { body: [] },
    })
    const { user, router } = renderRoute('/entrenar')

    await user.click(await screen.findByRole('button', { name: 'Terminar y guardar' }))

    // Back home, with the workout off the draft and waiting on the phone.
    expect(await screen.findByText('1 entreno pendiente de subir')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull()
    expect(storedOutbox().map((item) => item.payload.client_id)).toEqual([CLIENT_ID])

    phone.restore()

    await waitFor(() => expect(screen.queryByText('1 entreno pendiente de subir')).not.toBeInTheDocument())
    const posts = calls.filter((call) => call.method === 'POST' && call.path === '/workouts')
    expect(posts).toHaveLength(2)
    // The retry is the same workout, so the server can tell it apart from a new one.
    expect(posts.map((call) => (call.body as WorkoutIn).client_id)).toEqual([CLIENT_ID, CLIENT_ID])
    expect(storedOutbox()).toEqual([])
  })

  it('sends what was queued earlier as soon as the app opens, and only for its own user', async () => {
    window.localStorage.setItem(
      OUTBOX_STORAGE_KEY,
      JSON.stringify([queued(2, 'someone-else'), queued(USER.id, CLIENT_ID)]),
    )
    const calls = mockApi({
      'GET /auth/me': { body: USER },
      'POST /workouts': { status: 200, body: { id: 99 } },
      'GET /workouts?limit=5': { body: [] },
    })

    renderRoute('/')

    await waitFor(() => expect(storedOutbox().map((item) => item.userId)).toEqual([2]))
    const posts = calls.filter((call) => call.method === 'POST' && call.path === '/workouts')
    expect(posts.map((call) => (call.body as WorkoutIn).client_id)).toEqual([CLIENT_ID])
  })

  it('stops retrying a workout the server refuses and lets the user discard it', async () => {
    window.localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify([queued(USER.id, CLIENT_ID)]))
    const calls = mockApi({
      'GET /auth/me': { body: USER },
      'POST /workouts': { status: 422, body: { detail: 'Unknown routine id' } },
      'GET /workouts?limit=5': { body: [] },
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderRoute('/')

    await user.click(await screen.findByRole('button', { name: 'Descartar' }))

    expect(screen.queryByRole('region', { name: 'Entrenos sin subir' })).not.toBeInTheDocument()
    expect(storedOutbox()).toEqual([])
    expect(calls.filter((call) => call.method === 'POST' && call.path === '/workouts')).toHaveLength(1)
  })

  it('asks before signing out with workouts still to send and then forgets them', async () => {
    connection(false)
    window.localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify([queued(USER.id, CLIENT_ID)]))
    let signedIn = true
    mockApi({
      'GET /auth/me': () => (signedIn ? { body: USER } : { status: 401 }),
      'POST /auth/logout': () => {
        signedIn = false
        return { status: 204 }
      },
      'GET /workouts?limit=5': { body: [] },
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderRoute('/')

    await user.click(await screen.findByRole('link', { name: 'Cuenta' }))
    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('entrenos sin subir'))
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    expect(storedOutbox()).toEqual([])
  })
})
