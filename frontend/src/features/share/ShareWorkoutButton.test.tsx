import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User, Workout } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'

// jsdom has no canvas: the drawing is checked by eye, here only what is handed to the share sheet.
vi.mock('./share-card', () => ({
  shareCardPng: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
}))

const USER: User = {
  id: 1,
  email: 'dani@example.com',
  goal: null,
  nickname: null,
  sex: null,
  created_at: '2026-09-15T10:00:00Z',
}

const WORKOUT: Workout = {
  id: 3,
  routine_id: null,
  started_at: '2026-11-24T18:00:00Z',
  ended_at: '2026-11-24T19:00:00Z',
  notes: null,
  sets: [{ id: 1, exercise_id: 1, set_number: 1, reps: 5, weight_kg: 100, rpe: null, is_warmup: false }],
}

function showHome() {
  mockApi({
    'GET /auth/me': { body: USER },
    'GET /workouts?limit=5': { body: [WORKOUT] },
  })
  return renderRoute('/')
}

describe('Share a workout from the home screen', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:card')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens the share sheet with the card as a PNG', async () => {
    const share = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share })
    const { user } = showHome()

    await user.click(await screen.findByRole('button', { name: 'Compartir entreno: Entreno libre' }))

    await waitFor(() => expect(share).toHaveBeenCalledOnce())
    const [{ files, title }] = share.mock.calls[0] as unknown as [{ files: File[]; title: string }]
    expect(title).toBe('Entreno libre')
    expect(files[0].name).toBe('entreno-2026-11-24.png')
    expect(files[0].type).toBe('image/png')
  })

  it('downloads the card where the browser cannot share files', async () => {
    vi.stubGlobal('navigator', { ...navigator, canShare: undefined })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const { user } = showHome()

    await user.click(await screen.findByRole('button', { name: 'Compartir entreno: Entreno libre' }))

    await waitFor(() => expect(click).toHaveBeenCalledOnce())
    click.mockRestore()
  })
})
