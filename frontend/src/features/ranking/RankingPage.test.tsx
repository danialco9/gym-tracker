import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MyRanking, User, Zone } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'

const USER: User = {
  id: 7,
  email: 'dani@example.com',
  goal: null,
  nickname: null,
  sex: 'male',
  created_at: '2026-09-15T10:00:00Z',
}

const unranked = (zone: Zone) => ({ zone, tier: null, progress: null, percentile: null })

/** Gold on the chest, Diamond on the legs (the best zone), nothing elsewhere. */
const MINE: MyRanking = {
  needs_body_weight: false,
  zones: [
    { zone: 'chest', tier: 'gold', progress: 0.5, percentile: 50.4 },
    unranked('back'),
    unranked('shoulders'),
    unranked('arms'),
    { zone: 'legs', tier: 'diamond', progress: 0.1, percentile: 76.2 },
    unranked('core'),
  ],
  lifts: [
    {
      exercise: { id: 3, name: 'Press banca con barra' },
      zone: 'chest',
      tier: 'gold',
      progress: 0.5,
      percentile: 50.4,
      weight_kg: 80,
      reps: 8,
    },
    {
      exercise: { id: 9, name: 'Sentadilla trasera' },
      zone: 'legs',
      tier: 'diamond',
      progress: 0.1,
      percentile: 76.2,
      weight_kg: 120,
      reps: 5,
    },
  ],
}

describe('Ranking', () => {
  it('opens on my best zone with my tier and my exercises, and nobody else', async () => {
    const calls = mockApi({
      'GET /auth/me': { body: USER },
      'GET /ranking/zones': { body: MINE },
    })
    renderRoute('/ranking')

    expect(await screen.findByRole('radio', { name: /Pierna/ })).toHaveAttribute('aria-checked', 'true')
    const mine = await screen.findByRole('region', { name: 'Tu rango' })
    expect(within(mine).getByText('Diamante')).toBeInTheDocument()
    expect(within(mine).getByText('Más fuerte que el 76 %')).toBeInTheDocument()
    expect(within(mine).getByText('de la gente de tu peso que entrena')).toBeInTheDocument()
    expect(within(mine).getByRole('progressbar', { name: 'Hacia Esmeralda' })).toHaveAttribute(
      'aria-valuenow',
      '10',
    )

    // Only the zone's exercises, with the set behind each.
    const lift = screen.getByText('Sentadilla trasera', { selector: 'p' }).closest('li')!
    expect(within(lift).getByText('Tu mejor: 120 kg × 5')).toBeInTheDocument()
    expect(screen.queryByText('Press banca con barra', { selector: 'p' })).not.toBeInTheDocument()

    // No list of people, no position and no nickname to pick: only my own standing is asked for.
    expect(screen.queryByRole('list', { name: 'Clasificación' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Puesto/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Elige tu apodo/ })).not.toBeInTheDocument()
    expect(calls.filter((call) => call.path.startsWith('/ranking')).map((call) => call.path)).toEqual([
      '/ranking/zones',
    ])
  })

  it('switches zone with a tap', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /ranking/zones': { body: MINE },
    })
    const { user } = renderRoute('/ranking')

    await user.click(await screen.findByRole('radio', { name: /Pecho/ }))

    expect(screen.getByRole('radio', { name: /Pecho/ })).toHaveAttribute('aria-checked', 'true')
    expect(
      await screen.findByText('Más fuerte que el 50 %', { selector: 'p.font-medium' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Press banca con barra', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByText('Sentadilla trasera', { selector: 'p' })).not.toBeInTheDocument()
  })

  it('switches zone by tapping the body', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /ranking/zones': { body: MINE },
    })
    const { user } = renderRoute('/ranking')

    const body = await screen.findByRole('img', { name: /Tu rango por zona/ })
    // The whole body lit at first; a tap picks a zone and dims the others.
    expect(body.querySelector('[data-zone="legs"]')).not.toHaveClass('opacity-35')

    await user.click(body.querySelector('[data-zone="chest"]')!)

    expect(screen.getByRole('radio', { name: /Pecho/ })).toHaveAttribute('aria-checked', 'true')
    expect(body.querySelector('[data-zone="chest"]')).not.toHaveClass('opacity-35')
    expect(body.querySelector('[data-zone="legs"]')).toHaveClass('opacity-35')
    expect(
      await screen.findByText('Más fuerte que el 50 %', { selector: 'p.font-medium' }),
    ).toBeInTheDocument()
  })

  it('asks for the body weight before giving a tier', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /ranking/zones': {
        body: {
          ...MINE,
          needs_body_weight: true,
          zones: MINE.zones.map((zone) => unranked(zone.zone)),
          lifts: [],
        },
      },
    })
    renderRoute('/ranking')

    expect(await screen.findByRole('link', { name: /Apunta tu peso/ })).toHaveAttribute('href', '/medidas')
    expect(
      await screen.findByText('Registra ejercicios de pecho con peso para tener rango aquí.'),
    ).toBeInTheDocument()
  })

  it('asks who to be compared with until the user says', async () => {
    mockApi({
      'GET /auth/me': { body: { ...USER, sex: null } },
      'GET /ranking/zones': { body: MINE },
    })
    renderRoute('/ranking')

    expect(await screen.findByRole('link', { name: /¿Con quién te comparamos\?/ })).toHaveAttribute(
      'href',
      '/cuenta',
    )
  })
})

describe('Ranking on the home screen', () => {
  it('shows the body coloured by zone and my best one', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /ranking/zones': { body: MINE },
    })
    renderRoute('/')

    const card = await screen.findByRole('link', { name: /Ranking de fuerza/ })
    expect(card).toHaveAttribute('href', '/ranking')
    expect(within(card).getByRole('img')).toHaveAccessibleName(
      'Tu rango por zona. Pecho: Oro, Espalda: sin rango, Hombros: sin rango, Brazos: sin rango, ' +
        'Pierna: Diamante, Core: sin rango',
    )
    expect(within(card).getByText('Mejor: Pierna · Diamante')).toBeInTheDocument()
    expect(within(card).queryByText(/apodo/)).not.toBeInTheDocument()
  })
})
