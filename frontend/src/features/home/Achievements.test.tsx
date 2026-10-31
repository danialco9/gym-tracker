import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Achievements, User } from '@/lib/types'
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

const ACHIEVEMENTS: Achievements = {
  level: { number: 3, xp: 350, level_xp: 50, level_size_xp: 300 },
  streak: { current_days: 5, best_days: 9, last_workout_on: '2026-10-19', at_risk: false },
  missions: [
    { kind: 'training_days', progress: 2, target: 3, done: false },
    { kind: 'hard_sets', progress: 34, target: 30, done: true },
    { kind: 'records', progress: 0, target: 1, done: false },
  ],
  badges: [
    { kind: 'first_workout', earned_on: '2026-09-15' },
    { kind: 'workouts_10', earned_on: null },
  ],
}

function showHome(achievements: Achievements) {
  mockApi({
    'GET /auth/me': { body: USER },
    'GET /progress/achievements': { body: achievements },
  })
  return renderRoute('/')
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('Achievements on the home screen', () => {
  it('shows the level, the streak, the week missions and the badges', async () => {
    showHome(ACHIEVEMENTS)

    expect(await screen.findByText('Nivel 3')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Experiencia del nivel' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    )
    expect(screen.getByText('50 / 300 XP para el nivel 4')).toBeInTheDocument()
    expect(screen.getByText('5 días de racha')).toBeInTheDocument()
    expect(screen.getByText(/Puedes descansar un día sin perderla · mejor: 9 días/)).toBeInTheDocument()

    expect(screen.getByRole('progressbar', { name: 'Entrena 3 días' })).toHaveAttribute('aria-valuenow', '2')
    expect(screen.getByText('30/30')).toBeInTheDocument()
    expect(screen.getByText(/Completa 30 series/)).toHaveTextContent('(cumplida)')

    expect(screen.getByText('Insignias · 1/2')).toBeInTheDocument()
    expect(screen.getByText(/10 entrenos/)).toHaveTextContent('(bloqueada)')
  })

  it('warns when only training today keeps the streak', async () => {
    showHome({ ...ACHIEVEMENTS, streak: { ...ACHIEVEMENTS.streak, at_risk: true } })

    expect(await screen.findByText('Entrena hoy o la pierdes')).toBeInTheDocument()
  })

  it('celebrates the XP and the level gained since the last visit', async () => {
    window.localStorage.setItem('gym-tracker:seen-xp:v1:1', JSON.stringify({ xp: 280, level: 2 }))
    showHome(ACHIEVEMENTS)

    const statuses = await screen.findAllByRole('status')
    expect(statuses.map((status) => status.textContent)).toEqual(
      expect.arrayContaining(['¡Subes a nivel 3!', '+70 XP']),
    )
    // Seen now: the next visit does not celebrate it again.
    expect(JSON.parse(window.localStorage.getItem('gym-tracker:seen-xp:v1:1') ?? '')).toEqual({
      xp: 350,
      level: 3,
    })
  })

  it('celebrates nothing on the first visit', async () => {
    showHome(ACHIEVEMENTS)

    expect(await screen.findByText('Nivel 3')).toBeInTheDocument()
    expect(screen.queryByText(/^\+\d+ XP$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Subes a nivel/)).not.toBeInTheDocument()
  })
})
