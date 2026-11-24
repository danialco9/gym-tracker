import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Toaster } from '@/components/ui/sonner'
import type { User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'
import { DRAFT_STORAGE_KEY, type WorkoutDraft } from './draft'

const USER: User = {
  id: 1,
  email: 'dani@example.com',
  goal: null,
  nickname: null,
  sex: null,
  created_at: '2026-09-15T10:00:00Z',
}

function seedDraft() {
  const draft: WorkoutDraft = {
    clientId: 'draft-1',
    routineId: null,
    routineName: null,
    startedAt: '2026-09-15T16:00:00.000Z',
    notes: '',
    exercises: [
      {
        id: 'press',
        exerciseId: 5,
        name: 'Prensa de piernas',
        targets: [],
        sets: [{ id: 'set-1', reps: 10, weightKg: 120, rpe: null, isWarmup: false, done: false }],
      },
    ],
  }
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
}

beforeEach(() => {
  window.localStorage.clear()
  seedDraft()
})

describe('Exercise notes', () => {
  it('shows the saved note on the card and edits it with a tap', async () => {
    const calls = mockApi({
      'GET /auth/me': { body: USER },
      'GET /exercise-notes': { body: [{ exercise_id: 5, text: 'Asiento en 4' }] },
      'PUT /exercise-notes/5': ({ body }) => ({ body: { exercise_id: 5, ...(body as object) } }),
    })
    const { user } = renderRoute('/entrenar')

    await user.click(
      await screen.findByRole('button', { name: 'Editar nota de Prensa de piernas: Asiento en 4' }),
    )
    const box = screen.getByRole('textbox', { name: 'Nota de Prensa de piernas' })
    expect(box).toHaveValue('Asiento en 4')
    await user.clear(box)
    await user.type(box, 'Asiento en 5, pies altos')
    await user.click(screen.getByRole('button', { name: 'Guardar nota' }))

    expect(
      await screen.findByRole('button', {
        name: 'Editar nota de Prensa de piernas: Asiento en 5, pies altos',
      }),
    ).toBeInTheDocument()
    expect(calls.filter((call) => call.method === 'PUT')).toEqual([
      { method: 'PUT', path: '/exercise-notes/5', body: { text: 'Asiento en 5, pies altos' } },
    ])
    // A note already there is edited from the card, so there is no button to add another.
    expect(screen.queryByRole('button', { name: 'Añadir nota a Prensa de piernas' })).not.toBeInTheDocument()
  })

  it('adds a note from the buttons under the sets', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /exercise-notes': { body: [] },
      'PUT /exercise-notes/5': { body: { exercise_id: 5, text: 'Agarre ancho' } },
    })
    const { user } = renderRoute('/entrenar')

    await user.click(await screen.findByRole('button', { name: 'Añadir nota a Prensa de piernas' }))
    await user.type(screen.getByRole('textbox', { name: 'Nota de Prensa de piernas' }), 'Agarre ancho')
    await user.click(screen.getByRole('button', { name: 'Guardar nota' }))

    expect(
      await screen.findByRole('button', { name: 'Editar nota de Prensa de piernas: Agarre ancho' }),
    ).toBeInTheDocument()
  })

  it('keeps the text to try again when it cannot be saved', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /exercise-notes': { body: [] },
      'PUT /exercise-notes/5': { networkError: true },
    })
    // The toaster follows the system theme, which jsdom cannot tell.
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    render(<Toaster />)
    const { user } = renderRoute('/entrenar')

    await user.click(await screen.findByRole('button', { name: 'Añadir nota a Prensa de piernas' }))
    await user.type(screen.getByRole('textbox', { name: 'Nota de Prensa de piernas' }), 'Agarre ancho')
    await user.click(screen.getByRole('button', { name: 'Guardar nota' }))

    expect(await screen.findByText('No se pudo guardar la nota. Revisa la conexión.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nota de Prensa de piernas' })).toHaveValue('Agarre ancho')
  })
})
