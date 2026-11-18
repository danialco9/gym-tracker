import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PlanDay, Routine, User, WeekPlan } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'

const USER: User = {
  id: 1,
  email: 'dani@example.com',
  goal: null,
  nickname: null,
  sex: null,
  created_at: '2026-09-15T10:00:00Z',
}

const UPPER: Routine = {
  id: 3,
  name: 'Torso',
  description: null,
  created_at: '2026-09-15T10:00:00Z',
  exercises: [],
}
const LOWER: Routine = { ...UPPER, id: 4, name: 'Pierna' }

const rest = (on_date: string): PlanDay => ({
  on_date,
  kind: 'rest',
  routine: null,
  changed: false,
  trained: false,
})
const upper = (on_date: string, changes: Partial<PlanDay> = {}): PlanDay => ({
  on_date,
  kind: 'routine',
  routine: { id: 3, name: 'Torso', exercise_count: 6 },
  changed: false,
  trained: false,
  ...changes,
})

// Thursday 12 November 2026.
const WEEK: WeekPlan = {
  start: '2026-11-09',
  today: '2026-11-12',
  days: [
    upper('2026-11-09', { trained: true }),
    rest('2026-11-10'),
    { on_date: '2026-11-11', kind: 'free', routine: null, changed: true, trained: false },
    upper('2026-11-12'),
    rest('2026-11-13'),
    rest('2026-11-14'),
    rest('2026-11-15'),
  ],
}

function showHome(week: WeekPlan = WEEK, handlers: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({
    'GET /auth/me': { body: USER },
    'GET /plan/week': { body: week },
    'GET /plan/days': {
      body: [
        { weekday: 0, routine_id: 3 },
        { weekday: 3, routine_id: 3 },
      ],
    },
    'GET /routines': { body: [UPPER, LOWER] },
    ...handlers,
  })
  return { calls, ...renderRoute('/') }
}

describe('Week plan on the home screen', () => {
  it('shows each day, the ones trained, and what today holds', async () => {
    showHome()

    const week = await screen.findByRole('region', { name: 'Tu semana' })
    const trained = await within(week).findByRole('button', {
      name: 'Lunes, 9 de noviembre, Torso, entrenado',
    })
    // A trained day reads as done instead of naming the routine.
    expect(trained).toHaveTextContent('Hecho')
    expect(trained).not.toHaveTextContent('Torso')
    expect(
      within(week).getByRole('button', {
        name: 'Miércoles, 11 de noviembre, Entreno libre, cambiado solo este día',
      }),
    ).toBeInTheDocument()
    expect(
      within(week).getByRole('button', { name: 'Jueves, 12 de noviembre, Torso, hoy' }),
    ).toBeInTheDocument()
    expect(
      within(week)
        .getByText(/Hoy toca/)
        .closest('p'),
    ).toHaveTextContent('Hoy toca Torso · 6 ejercicios')
    expect(within(week).getByRole('link', { name: 'Empezar' })).toHaveAttribute('href', '/entrenar?rutina=3')
  })

  it('says so when today is a rest day or already trained', async () => {
    showHome({
      ...WEEK,
      days: WEEK.days.map((day) => (day.on_date === WEEK.today ? rest(day.on_date) : day)),
    })
    expect(await screen.findByText(/Hoy descansas/)).toBeInTheDocument()
  })

  it('invites to plan the week while it is empty', async () => {
    showHome({ ...WEEK, days: WEEK.days.map((day) => rest(day.on_date)) })

    expect(await screen.findByRole('link', { name: 'Planificar mi semana' })).toHaveAttribute(
      'href',
      '/semana',
    )
    expect(screen.queryByRole('link', { name: 'Empezar' })).not.toBeInTheDocument()
  })

  it('moves to the next week and back', async () => {
    const next = {
      ...WEEK,
      start: '2026-11-16',
      days: WEEK.days.map((_, index) => rest(`2026-11-${16 + index}`)),
    }
    const { user, calls } = showHome(WEEK, { 'GET /plan/week?start=2026-11-16': { body: next } })

    await user.click(await screen.findByRole('button', { name: 'Semana siguiente' }))

    expect(await screen.findByText('Semana 16 – 22 nov')).toBeInTheDocument()
    expect(calls.some((call) => call.path === '/plan/week?start=2026-11-16')).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Hoy' }))
    expect(await screen.findByText('Esta semana')).toBeInTheDocument()
  })

  it('changes a single date', async () => {
    const { user, calls } = showHome(WEEK, { 'PUT /plan/changes/2026-11-12': { body: WEEK } })

    await user.click(await screen.findByRole('button', { name: /Jueves, 12 de noviembre/ }))
    await user.click(await screen.findByRole('button', { name: 'Descanso' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(calls.find((call) => call.method === 'PUT')).toEqual({
      method: 'PUT',
      path: '/plan/changes/2026-11-12',
      body: { kind: 'rest', routine_id: null },
    })
  })

  it('changes a weekday for every week, keeping the others', async () => {
    const { user, calls } = showHome(WEEK, { 'PUT /plan/days': { body: [] } })

    await user.click(await screen.findByRole('button', { name: /Viernes, 13 de noviembre/ }))
    await user.click(await screen.findByRole('button', { name: 'Pierna' }))
    await user.click(screen.getByRole('button', { name: 'Todos los viernes' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
      days: [
        { weekday: 0, routine_id: 3 },
        { weekday: 3, routine_id: 3 },
        { weekday: 4, routine_id: 4 },
      ],
    })
  })

  it('moves a day to another, or undoes a change', async () => {
    const { user, calls } = showHome(WEEK, {
      'POST /plan/move': { body: WEEK },
      'DELETE /plan/changes/2026-11-11': { body: WEEK },
    })

    await user.click(await screen.findByRole('button', { name: /Jueves, 12 de noviembre/ }))
    await user.click(await screen.findByRole('button', { name: 'Mover al sábado, 14 de noviembre' }))
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      from_date: '2026-11-12',
      to_date: '2026-11-14',
    })

    await user.click(await screen.findByRole('button', { name: /Miércoles, 11 de noviembre/ }))
    await user.click(await screen.findByRole('button', { name: 'Volver a lo de siempre' }))
    expect(calls.some((call) => call.method === 'DELETE' && call.path === '/plan/changes/2026-11-11')).toBe(
      true,
    )
  })

  it('starts today’s routine from its plan', async () => {
    const { user, router } = showHome()

    await user.click(await screen.findByRole('link', { name: 'Empezar' }))

    expect(router.state.location.search).toBe('?rutina=3')
    expect(await screen.findByRole('heading', { name: 'Torso' })).toBeInTheDocument()
  })
})
