import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PlannedDay, PresetDay, User, WeekPlan } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'
import { hasBackToBackDays } from './week-dates'

const USER: User = {
  id: 1,
  email: 'dani@example.com',
  goal: null,
  nickname: null,
  sex: null,
  created_at: '2026-09-15T10:00:00Z',
}

const EMPTY_WEEK: WeekPlan = {
  start: '2026-11-09',
  today: '2026-11-12',
  days: Array.from({ length: 7 }, (_, index) => ({
    on_date: `2026-11-${9 + index}`.replace(/-(\d)$/, '-0$1'),
    kind: 'rest',
    routine: null,
    changed: false,
    trained: false,
  })),
}

const FULL_BODY: PresetDay[] = [
  { weekday: 0, name: 'Cuerpo completo A', exercises: ['Sentadilla con barra', 'Press banca con barra'] },
  { weekday: 2, name: 'Cuerpo completo B', exercises: ['Peso muerto rumano'] },
  { weekday: 4, name: 'Cuerpo completo C', exercises: ['Prensa de piernas'] },
]

function showSetup(usualWeek: PlannedDay[] = [], handlers: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({
    'GET /auth/me': { body: USER },
    'GET /plan/days': { body: usualWeek },
    'GET /plan/week': { body: EMPTY_WEEK },
    'GET /routines': { body: [] },
    ...handlers,
  })
  return { calls, ...renderRoute('/semana') }
}

const day = (name: string) => screen.getByRole('button', { name })

describe('Week plan setup', () => {
  it('lays the ready-made split on the chosen days and saves it', async () => {
    const { user, calls, router } = showSetup([], {
      'GET /plan/presets?weekdays=0&weekdays=2&weekdays=4': { body: FULL_BODY },
      'POST /plan/presets': { status: 201, body: [] },
    })

    await user.click(await screen.findByRole('button', { name: 'Lunes' }))
    await user.click(day('Miércoles'))
    await user.click(day('Viernes'))
    expect(screen.getByText('3 días a la semana.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Prepárame las rutinas/ }))

    expect(await screen.findByText('Cuerpo completo A')).toBeInTheDocument()
    expect(screen.getByText('Sentadilla con barra · Press banca con barra')).toBeInTheDocument()
    expect(screen.queryByText(/conviene descansar un día/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Guardar mi semana' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ weekdays: [0, 2, 4] })
  })

  it('warns when full-body sessions fall on days in a row', async () => {
    const { user } = showSetup([], {
      'GET /plan/presets?weekdays=0&weekdays=1': { body: FULL_BODY.slice(0, 2) },
    })

    await user.click(await screen.findByRole('button', { name: 'Lunes' }))
    await user.click(day('Martes'))
    await user.click(screen.getByRole('button', { name: /Prepárame las rutinas/ }))

    expect(await screen.findByText(/conviene descansar un día entre sesiones/)).toBeInTheDocument()
  })

  it('leaves a free workout on each day when no routines are wanted', async () => {
    const { user, calls } = showSetup([], { 'PUT /plan/days': { body: [] } })

    await user.click(await screen.findByRole('button', { name: 'Lunes' }))
    await user.click(day('Jueves'))
    await user.click(screen.getByRole('button', { name: /Entreno libre/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar mi semana' }))

    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
        days: [
          { weekday: 0, routine_id: null },
          { weekday: 3, routine_id: null },
        ],
      }),
    )
  })

  it('starts from the usual week and keeps a rest day for the ready-made split', async () => {
    const everyDay = Array.from({ length: 6 }, (_, weekday) => ({ weekday, routine_id: null }))
    const { user } = showSetup(everyDay)

    expect(await screen.findByText('6 días a la semana.')).toBeInTheDocument()
    expect(day('Sábado')).toHaveAttribute('aria-pressed', 'true')
    await user.click(day('Domingo'))

    expect(screen.getByRole('button', { name: /Prepárame las rutinas/ })).toBeDisabled()
    expect(screen.getByText(/deja al menos un día de descanso/)).toBeInTheDocument()
  })

  it('tells days in a row apart, Sunday into Monday included', () => {
    expect(hasBackToBackDays([0, 2, 4])).toBe(false)
    expect(hasBackToBackDays([2, 3])).toBe(true)
    expect(hasBackToBackDays([0, 6])).toBe(true)
  })
})
