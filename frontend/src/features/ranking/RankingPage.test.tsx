import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ExerciseRanking, Ranking, User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'

const USER: User = {
  id: 7,
  email: 'dani@example.com',
  goal: null,
  nickname: null,
  show_in_ranking: true,
  created_at: '2026-09-15T10:00:00Z',
}

const ME = { needs_body_weight: false, show_in_ranking: true }

const RANKING: Ranking = {
  me: { ...ME, tier: 'gold', progress: 0.5, position: 2 },
  entries: [
    { position: 1, name: 'Tigre', tier: 'diamond', is_me: false },
    { position: 2, name: 'Atleta 7', tier: 'gold', is_me: true },
    { position: 3, name: 'Atleta 12', tier: 'bronze', is_me: false },
  ],
  exercises: [
    { id: 3, name: 'Press banca con barra' },
    { id: 9, name: 'Sentadilla trasera' },
  ],
}

const BENCH: ExerciseRanking = {
  exercise: { id: 3, name: 'Press banca con barra' },
  me: { ...ME, tier: 'ruby', progress: 0.25, position: 1 },
  entries: [{ position: 1, name: 'Atleta 7', tier: 'ruby', is_me: true }],
}

describe('Ranking', () => {
  it('shows my tier, the list and each exercise on its own', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /ranking': { body: RANKING },
      'GET /ranking/exercises/3': { body: BENCH },
    })
    const { user } = renderRoute('/ranking')

    const mine = await screen.findByRole('region', { name: 'Tu rango' })
    expect(within(mine).getByText('Oro')).toBeInTheDocument()
    expect(within(mine).getByText('Puesto 2 de 3')).toBeInTheDocument()
    expect(within(mine).getByRole('progressbar', { name: 'Hacia Platino' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    )
    const rows = within(screen.getByRole('list', { name: 'Clasificación' })).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      '1TigreDiamante',
      '2Atleta 7 (tú)Oro',
      '3Atleta 12Bronce',
    ])
    expect(screen.getByRole('link', { name: /Elige tu apodo/ })).toHaveAttribute('href', '/cuenta')

    await user.selectOptions(screen.getByLabelText('Ver'), 'Press banca con barra')

    expect(
      await within(screen.getByRole('region', { name: 'Tu rango' })).findByText('Rubí'),
    ).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Clasificación' })).getAllByRole('listitem')).toHaveLength(
      1,
    )
  })

  it('asks for the body weight before giving a tier', async () => {
    mockApi({
      'GET /auth/me': { body: { ...USER, nickname: 'Tigre' } },
      'GET /ranking': {
        body: {
          me: { tier: null, progress: null, position: null, needs_body_weight: true, show_in_ranking: true },
          entries: [],
          exercises: [],
        },
      },
    })
    renderRoute('/ranking')

    expect(await screen.findByRole('link', { name: /Apunta tu peso/ })).toHaveAttribute('href', '/medidas')
    expect(screen.getByText('Registra entrenos con peso para tener rango.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Elige tu apodo/ })).not.toBeInTheDocument()
  })

  it('tells a hidden user that nobody else sees them', async () => {
    mockApi({
      'GET /auth/me': { body: { ...USER, nickname: 'Tigre', show_in_ranking: false } },
      'GET /ranking': {
        body: {
          ...RANKING,
          me: { ...RANKING.me, position: null, show_in_ranking: false },
          entries: RANKING.entries.filter((entry) => !entry.is_me),
        },
      },
    })
    renderRoute('/ranking')

    expect(await screen.findByText('Estás oculto: los demás no te ven')).toBeInTheDocument()
  })
})

describe('Ranking on the home screen', () => {
  it('shows my tier and asks for a nickname until there is one', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /ranking': { body: RANKING },
    })
    renderRoute('/')

    const card = await screen.findByRole('link', { name: /Ranking de fuerza/ })
    expect(card).toHaveAttribute('href', '/ranking')
    expect(within(card).getByText('Oro · puesto 2 de 3')).toBeInTheDocument()
    expect(within(card).getByText('Elige tu apodo: ahora sales como Atleta 7')).toBeInTheDocument()
  })
})
