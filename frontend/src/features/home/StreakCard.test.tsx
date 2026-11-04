import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Streak, User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'

const USER: User = {
  id: 1,
  email: 'dani@example.com',
  goal: null,
  nickname: null,
  sex: null,
  show_in_ranking: true,
  created_at: '2026-09-15T10:00:00Z',
}

const STREAK: Streak = { current_days: 5, best_days: 9, last_workout_on: '2026-10-19', at_risk: false }

function showHome(streak: Streak) {
  mockApi({
    'GET /auth/me': { body: USER },
    'GET /progress/streak': { body: streak },
  })
  return renderRoute('/')
}

describe('Streak on the home screen', () => {
  it('shows the days in a row and the best streak', async () => {
    showHome(STREAK)

    expect(await screen.findByText('5 días de racha')).toBeInTheDocument()
    expect(screen.getByText(/Puedes descansar un día sin perderla · mejor: 9 días/)).toBeInTheDocument()
  })

  it('warns when only training today keeps the streak', async () => {
    showHome({ ...STREAK, at_risk: true })

    expect(await screen.findByText('Entrena hoy o la pierdes')).toBeInTheDocument()
  })

  it('invites to start one without workouts', async () => {
    showHome({ current_days: 0, best_days: 0, last_workout_on: null, at_risk: false })

    expect(await screen.findByText('Entrena hoy para empezar una racha')).toBeInTheDocument()
  })

  it('shows no levels, missions or badges', async () => {
    showHome(STREAK)

    await screen.findByText('5 días de racha')
    expect(screen.queryByText(/Nivel \d/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Misiones/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Insignias/)).not.toBeInTheDocument()
  })
})
