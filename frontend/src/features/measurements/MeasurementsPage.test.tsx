import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BodyMeasurement, User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'
import { localToday } from './measurement-form'

// Recharts needs real layout (ResizeObserver, element sizes), which jsdom does not provide.
vi.mock('./WeightChart', () => ({
  WeightChart: ({ points }: { points: unknown[] }) => <p>Gráfica con {points.length} pesos</p>,
}))

const USER: User = {
  id: 1,
  email: 'dani@example.com',
  goal: null,
  nickname: null,
  sex: null,
  show_in_ranking: true,
  created_at: '2026-09-15T10:00:00Z',
}

function measurement(overrides: Partial<BodyMeasurement> = {}): BodyMeasurement {
  return {
    id: 1,
    measured_on: '2026-09-14',
    weight_kg: 78.7,
    body_fat_pct: null,
    waist_cm: null,
    chest_cm: null,
    arm_cm: null,
    thigh_cm: null,
    notes: null,
    ...overrides,
  }
}

describe('Measurements', () => {
  it("logs today's weight", async () => {
    let measurements: BodyMeasurement[] = []
    const calls = mockApi({
      'GET /auth/me': { body: USER },
      'GET /measurements': () => ({ body: measurements }),
      'POST /measurements': ({ body }) => {
        measurements = [{ id: 3, ...(body as Omit<BodyMeasurement, 'id'>) }]
        return { status: 201, body: measurements[0] }
      },
    })
    const { user } = renderRoute('/medidas')

    expect(await screen.findByText(/Aún no has registrado medidas/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Peso (kg)'), '78,4')
    await user.click(screen.getByRole('button', { name: 'Guardar medida' }))

    expect(await screen.findByRole('heading', { name: 'Editar medida' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /78,4 kg/ })).toBeInTheDocument()
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      measured_on: localToday(),
      weight_kg: 78.4,
      body_fat_pct: null,
      waist_cm: null,
      chest_cm: null,
      arm_cm: null,
      thigh_cm: null,
      notes: null,
    })
  })

  it('opens a history entry to edit and delete it', async () => {
    let measurements = [
      measurement({ id: 1, measured_on: '2026-09-13', weight_kg: 79.1 }),
      measurement({ id: 2, measured_on: '2026-09-14', weight_kg: 78.7, waist_cm: 82 }),
    ]
    const calls = mockApi({
      'GET /auth/me': { body: USER },
      'GET /measurements': () => ({ body: measurements }),
      'PUT /measurements/2': ({ body }) => {
        measurements = [measurements[0], { id: 2, ...(body as Omit<BodyMeasurement, 'id'>) }]
        return { body: measurements[1] }
      },
      'DELETE /measurements/2': () => {
        measurements = [measurements[0]]
        return { status: 204 }
      },
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderRoute('/medidas')

    expect(await screen.findByText('Gráfica con 2 pesos')).toBeInTheDocument()
    const entry = screen.getByRole('button', { name: /78,7 kg/ })
    expect(entry).toHaveTextContent('-0,4 kg')
    expect(entry).toHaveTextContent('Cintura 82 cm')

    await user.click(entry)
    expect(screen.getByRole('heading', { name: 'Editar medida' })).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-09-14')
    expect(screen.getByLabelText('Cintura (cm)')).toBeVisible()
    await user.clear(screen.getByLabelText('Cintura (cm)'))
    await user.type(screen.getByLabelText('Cintura (cm)'), '81,5')
    await user.click(screen.getByRole('button', { name: 'Guardar medida' }))

    expect(await screen.findByText('Cintura 81,5 cm')).toBeInTheDocument()
    expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({
      measured_on: '2026-09-14',
      weight_kg: 78.7,
      waist_cm: 81.5,
    })

    await user.click(screen.getByRole('button', { name: 'Eliminar medida' }))
    expect(await screen.findByRole('heading', { name: 'Nueva medida' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /78,7 kg/ })).not.toBeInTheDocument()
    expect(calls.some((call) => call.method === 'DELETE' && call.path === '/measurements/2')).toBe(true)
  })

  it('loads the entry of a chosen date and validates the values', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /measurements': { body: [measurement({ id: 1, measured_on: '2026-09-10', weight_kg: 80 })] },
    })
    const { user } = renderRoute('/medidas')

    await user.click(await screen.findByRole('button', { name: 'Guardar medida' }))
    expect(await screen.findByText('Introduce al menos una medida')).toBeInTheDocument()

    const date = screen.getByLabelText('Fecha')
    await user.clear(date)
    await user.type(date, '2026-09-10')
    expect(await screen.findByRole('heading', { name: 'Editar medida' })).toBeInTheDocument()
    expect(screen.getByLabelText('Peso (kg)')).toHaveValue('80')

    await user.click(screen.getByRole('button', { name: 'Más medidas' }))
    await user.type(screen.getByLabelText('Grasa corporal (%)'), '120')
    await user.click(screen.getByRole('button', { name: 'Más medidas' }))
    await user.click(screen.getByRole('button', { name: 'Guardar medida' }))
    expect(await screen.findByText('Grasa: máximo 100')).toBeVisible()
  })
})
