import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ExerciseRanking, MyRanking, User, Zone, ZoneRanking } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'

const USER: User = {
  id: 7,
  email: 'dani@example.com',
  goal: null,
  nickname: null,
  sex: 'male',
  show_in_ranking: true,
  created_at: '2026-09-15T10:00:00Z',
}

const ME = { needs_body_weight: false, show_in_ranking: true, source: null }

const unranked = (zone: Zone) => ({ zone, tier: null, progress: null, percentile: null })

/** Gold on the chest, Diamond on the legs (the best zone), nothing elsewhere. */
const MINE: MyRanking = {
  needs_body_weight: false,
  show_in_ranking: true,
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
      source: 'estimate',
      weight_kg: 80,
      reps: 8,
    },
    {
      exercise: { id: 9, name: 'Sentadilla trasera' },
      zone: 'legs',
      tier: 'diamond',
      progress: 0.1,
      percentile: 76.2,
      source: 'app',
      weight_kg: 120,
      reps: 5,
    },
  ],
}

const LEGS: ZoneRanking = {
  zone: 'legs',
  me: { ...ME, tier: 'diamond', progress: 0.1, percentile: 76.2, position: 2 },
  entries: [
    { position: 1, name: 'Tigre', tier: 'ruby', is_me: false },
    { position: 2, name: 'Atleta 7', tier: 'diamond', is_me: true },
    { position: 3, name: 'Atleta 12', tier: 'bronze', is_me: false },
  ],
  exercises: [
    { id: 4, name: 'Prensa de piernas' },
    { id: 9, name: 'Sentadilla trasera' },
  ],
}

const CHEST: ZoneRanking = {
  zone: 'chest',
  me: { ...ME, tier: 'gold', progress: 0.5, percentile: 50.4, position: 1 },
  entries: [{ position: 1, name: 'Atleta 7', tier: 'gold', is_me: true }],
  exercises: [{ id: 3, name: 'Press banca con barra' }],
}

const SQUAT: ExerciseRanking = {
  exercise: { id: 9, name: 'Sentadilla trasera' },
  me: { ...ME, tier: 'diamond', progress: 0.1, percentile: 76.2, source: 'app', position: 1 },
  entries: [{ position: 1, name: 'Atleta 7', tier: 'diamond', is_me: true }],
}

const rowsOf = () =>
  within(screen.getByRole('list', { name: 'Clasificación' }))
    .getAllByRole('listitem')
    .map((row) => row.textContent)

describe('Ranking', () => {
  it('opens on my best zone with my tier, my exercises and the list', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /ranking/zones': { body: MINE },
      'GET /ranking/zones/legs': { body: LEGS },
      'GET /ranking/exercises/9': { body: SQUAT },
    })
    const { user } = renderRoute('/ranking')

    expect(await screen.findByRole('radio', { name: /Pierna/ })).toHaveAttribute('aria-checked', 'true')
    const mine = await screen.findByRole('region', { name: 'Tu rango' })
    expect(within(mine).getByText('Diamante')).toBeInTheDocument()
    expect(within(mine).getByText('Más fuerte que el 76 %')).toBeInTheDocument()
    expect(within(mine).getByText('Puesto 2 de 3')).toBeInTheDocument()
    expect(within(mine).getByRole('progressbar', { name: 'Hacia Esmeralda' })).toHaveAttribute(
      'aria-valuenow',
      '10',
    )

    // Only the zone's exercises, with the set behind each and where its percentile comes from.
    const lift = screen.getByText('Sentadilla trasera', { selector: 'p' }).closest('li')!
    expect(within(lift).getByText('Tu mejor: 120 kg × 5')).toBeInTheDocument()
    expect(within(lift).getByText('Frente a usuarios de la app')).toBeInTheDocument()
    expect(screen.queryByText('Press banca con barra', { selector: 'p' })).not.toBeInTheDocument()

    expect(rowsOf()).toEqual(['1TigreRubí', '2Atleta 7 (tú)Diamante', '3Atleta 12Bronce'])
    expect(screen.getByRole('link', { name: /Elige tu apodo/ })).toHaveAttribute('href', '/cuenta')

    await user.selectOptions(screen.getByLabelText('Ver'), 'Sentadilla trasera')
    await waitFor(() => expect(rowsOf()).toEqual(['1Atleta 7 (tú)Diamante']))
  })

  it('switches zone with a tap', async () => {
    mockApi({
      'GET /auth/me': { body: { ...USER, nickname: 'Tigre' } },
      'GET /ranking/zones': { body: MINE },
      'GET /ranking/zones/legs': { body: LEGS },
      'GET /ranking/zones/chest': { body: CHEST },
    })
    const { user } = renderRoute('/ranking')

    await user.click(await screen.findByRole('radio', { name: /Pecho/ }))

    expect(screen.getByRole('radio', { name: /Pecho/ })).toHaveAttribute('aria-checked', 'true')
    expect(
      await screen.findByText('Más fuerte que el 50 %', { selector: 'p.font-medium' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Estimación')).toBeInTheDocument()
    expect(screen.queryByText('Sentadilla trasera', { selector: 'p' })).not.toBeInTheDocument()
  })

  it('asks for the body weight before giving a tier', async () => {
    mockApi({
      'GET /auth/me': { body: { ...USER, nickname: 'Tigre' } },
      'GET /ranking/zones': {
        body: {
          ...MINE,
          needs_body_weight: true,
          zones: MINE.zones.map((zone) => unranked(zone.zone)),
          lifts: [],
        },
      },
      'GET /ranking/zones/chest': {
        body: {
          ...CHEST,
          me: {
            ...ME,
            needs_body_weight: true,
            tier: null,
            progress: null,
            percentile: null,
            position: null,
          },
          entries: [],
        },
      },
    })
    renderRoute('/ranking')

    expect(await screen.findByRole('link', { name: /Apunta tu peso/ })).toHaveAttribute('href', '/medidas')
    expect(
      await screen.findByText('Registra ejercicios de pecho con peso para tener rango aquí.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Elige tu apodo/ })).not.toBeInTheDocument()
  })

  it('asks who to be compared with until the user says', async () => {
    mockApi({
      'GET /auth/me': { body: { ...USER, nickname: 'Tigre', sex: null } },
      'GET /ranking/zones': { body: MINE },
      'GET /ranking/zones/legs': { body: LEGS },
    })
    renderRoute('/ranking')

    expect(await screen.findByRole('link', { name: /¿Con quién te comparamos\?/ })).toHaveAttribute(
      'href',
      '/cuenta',
    )
  })

  it('tells a hidden user that nobody else sees them', async () => {
    mockApi({
      'GET /auth/me': { body: { ...USER, nickname: 'Tigre', show_in_ranking: false } },
      'GET /ranking/zones': { body: MINE },
      'GET /ranking/zones/legs': {
        body: {
          ...LEGS,
          me: { ...LEGS.me, position: null, show_in_ranking: false },
          entries: LEGS.entries.filter((entry) => !entry.is_me),
        },
      },
    })
    renderRoute('/ranking')

    expect(await screen.findByText('Estás oculto: los demás no te ven')).toBeInTheDocument()
  })
})

describe('Ranking on the home screen', () => {
  it('shows a medal per zone, my best one, and asks for a nickname until there is one', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /ranking/zones': { body: MINE },
    })
    renderRoute('/')

    const card = await screen.findByRole('link', { name: /Ranking de fuerza/ })
    expect(card).toHaveAttribute('href', '/ranking')
    expect(
      within(card)
        .getAllByRole('listitem')
        .map((zone) => zone.textContent),
    ).toEqual([
      'Pecho: Oro',
      'Espalda: sin rango',
      'Hombro: sin rango',
      'Brazos: sin rango',
      'Pierna: Diamante',
      'Core: sin rango',
    ])
    expect(within(card).getByText('Mejor: Pierna · Diamante')).toBeInTheDocument()
    expect(within(card).getByText('Elige tu apodo: ahora sales como Atleta 7')).toBeInTheDocument()
  })
})
