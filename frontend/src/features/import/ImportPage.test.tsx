import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'
import type { ImportPreview } from './queries'

const USER: User = {
  id: 1,
  email: 'nuevo@gymtracker.dev',
  goal: null,
  nickname: null,
  sex: null,
  created_at: '2026-09-24T10:00:00Z',
}

const CSV = 'title,start_time,exercise_title,reps\nPierna,"15 Jan 2024, 10:30",Squat (Barbell),5\n'

const PREVIEW: ImportPreview = {
  source: 'hevy',
  workouts: 2,
  sets: 4,
  duplicates: 1,
  skipped_rows: 3,
  first_date: '2024-01-15',
  last_date: '2024-01-17',
  exercises: [
    { name: 'Squat (Barbell)', sets: 2, exercise_id: 10, suggestions: [] },
    {
      name: 'Calf Raise (Machine)',
      sets: 2,
      exercise_id: null,
      suggestions: [
        { id: 20, name: 'Elevación de gemelos de pie' },
        { id: 21, name: 'Elevación de gemelos sentado' },
      ],
    },
  ],
}

const csvFile = (content = CSV) => new File([content], 'workouts.csv', { type: 'text/csv' })

describe('Import', () => {
  it('opens from the account screen', async () => {
    mockApi({ 'GET /auth/me': { body: USER } })
    const { user, router } = renderRoute('/cuenta')

    await user.click(await screen.findByRole('link', { name: /Importar entrenos/ }))

    expect(router.state.location.pathname).toBe('/importar')
  })

  it('reads the file, asks for the unmatched exercise and imports with that choice', async () => {
    const calls = mockApi({
      'GET /auth/me': { body: USER },
      'POST /import/workouts/preview': { body: PREVIEW },
      'POST /import/workouts': { body: { workouts: 2, sets: 4, duplicates: 1 } },
    })
    const { user } = renderRoute('/importar')

    await user.upload(await screen.findByLabelText(/Elegir archivo CSV/), csvFile())

    expect(await screen.findByRole('heading', { name: 'Elige los ejercicios' })).toBeInTheDocument()
    expect(calls.find((call) => call.path === '/import/workouts/preview')?.body).toEqual({ content: CSV })
    // Only the name that matched nothing is asked about.
    expect(screen.queryByText('Squat (Barbell)')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Faltan 1 por elegir' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Elevación de gemelos de pie' }))
    expect(
      screen.getByRole('button', { name: 'Cambiar ejercicio para Calf Raise (Machine)' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Seguir' }))

    expect(await screen.findByRole('heading', { name: '¿Lo importo?' })).toBeInTheDocument()
    expect(screen.getByText('Desde Hevy')).toBeInTheDocument()
    expect(screen.getByText(/2 entrenos · 4 series/)).toBeInTheDocument()
    expect(screen.getByText(/1 entreno ya estaba en tu cuenta/)).toBeInTheDocument()
    expect(screen.getByText(/Se saltan 3 filas/)).toBeInTheDocument()
    expect(screen.getByText('Del 15 ene 2024 al 17 ene 2024')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Importar 2 entrenos' }))

    expect(await screen.findByText(/Listo: 2 entrenos importados con 4 series/)).toBeInTheDocument()
    expect(calls.find((call) => call.path === '/import/workouts')?.body).toEqual({
      content: CSV,
      exercise_ids: { 'Calf Raise (Machine)': 20 },
    })
    expect(screen.getByRole('link', { name: 'Ver mi progreso' })).toHaveAttribute('href', '/progreso')
  })

  it('goes straight to the summary when every exercise matched', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'POST /import/workouts/preview': {
        body: { ...PREVIEW, duplicates: 0, skipped_rows: 0, exercises: [PREVIEW.exercises[0]] },
      },
    })
    const { user } = renderRoute('/importar')

    await user.upload(await screen.findByLabelText(/Elegir archivo CSV/), csvFile())

    expect(await screen.findByRole('button', { name: 'Importar 2 entrenos' })).toBeInTheDocument()
    expect(screen.queryByText(/ya estaba/)).not.toBeInTheDocument()
  })

  it('says when everything in the file is already there', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'POST /import/workouts/preview': {
        body: {
          ...PREVIEW,
          workouts: 0,
          sets: 0,
          duplicates: 2,
          first_date: null,
          last_date: null,
          exercises: [],
        },
      },
    })
    const { user } = renderRoute('/importar')

    await user.upload(await screen.findByLabelText(/Elegir archivo CSV/), csvFile())

    expect(await screen.findByText(/ya están en tu cuenta/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ya lo tienes todo' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Elegir otro archivo' }))
    expect(await screen.findByLabelText(/Elegir archivo CSV/)).toBeInTheDocument()
  })

  it('explains a file it does not know', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'POST /import/workouts/preview': { status: 422, body: { detail: 'Unknown file layout' } },
    })
    const { user } = renderRoute('/importar')

    await user.upload(await screen.findByLabelText(/Elegir archivo CSV/), csvFile('a,b\n1,2\n'))

    expect(
      await screen.findByText(/no parece una exportación de Strong, de Hevy ni de esta app/),
    ).toBeInTheDocument()
  })
})
