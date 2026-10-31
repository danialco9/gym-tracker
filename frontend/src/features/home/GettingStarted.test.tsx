import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import { GettingStarted } from '@/features/home/GettingStarted'
import type { User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'

function renderSteps(props: Parameters<typeof GettingStarted>[0]) {
  return render(
    <MemoryRouter>
      <GettingStarted {...props} />
    </MemoryRouter>,
  )
}

test('points a new account at every step', () => {
  renderSteps({ hasRoutine: false, hasWorkout: false, hasWeight: false })

  expect(screen.getByRole('link', { name: /Crea tu rutina/ })).toHaveAttribute('href', '/rutinas/nueva')
  expect(screen.getByRole('link', { name: /Haz tu primer entreno/ })).toHaveAttribute('href', '/entrenar')
  expect(screen.getByRole('link', { name: /Apunta tu peso/ })).toHaveAttribute('href', '/medidas')
})

test('ticks off a step once it is done', () => {
  renderSteps({ hasRoutine: true, hasWorkout: false, hasWeight: false })

  expect(screen.queryByRole('link', { name: /Crea tu rutina/ })).toBeNull()
  expect(screen.getByText('Crea tu rutina').closest('p')).toHaveTextContent('(hecho)')
  expect(screen.getByRole('link', { name: /Haz tu primer entreno/ })).toBeInTheDocument()
})

test('goes away with a routine and a workout, even without a weight', () => {
  const { container } = renderSteps({ hasRoutine: true, hasWorkout: true, hasWeight: false })

  expect(container).toBeEmptyDOMElement()
})

test('shows on the home screen of an empty account', async () => {
  const user: User = {
    id: 1,
    email: 'nuevo@gymtracker.dev',
    goal: null,
    nickname: null,
    sex: null,
    show_in_ranking: true,
    created_at: '2026-09-24T10:00:00Z',
  }
  mockApi({
    'GET /auth/me': { body: user },
    'GET /routines': { body: [] },
    'GET /workouts?limit=5': { body: [] },
  })
  renderRoute('/')

  expect(await screen.findByRole('heading', { name: 'Primeros pasos' })).toBeInTheDocument()
})
