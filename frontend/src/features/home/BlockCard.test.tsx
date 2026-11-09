import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'
import { BlockCard } from './BlockCard'

const USER: User = {
  id: 1,
  email: 'dani@example.com',
  goal: 'build_muscle',
  nickname: null,
  sex: null,
  show_in_ranking: true,
  created_at: '2026-09-15T10:00:00Z',
}

describe('Training block card', () => {
  it('says the week of the block and how far the deload is', () => {
    const { rerender } = render(<BlockCard block={{ week: 2, weeks: 5, is_deload: false }} />)
    expect(screen.getByText('Semana 2 de 5 del bloque')).toBeInTheDocument()
    expect(screen.getByText('Descarga en 3 semanas')).toBeInTheDocument()

    rerender(<BlockCard block={{ week: 4, weeks: 5, is_deload: false }} />)
    expect(screen.getByText('Descarga la semana que viene')).toBeInTheDocument()
  })

  it('turns into the reminder to train lighter in the deload week', () => {
    render(<BlockCard block={{ week: 5, weeks: 5, is_deload: true }} />)

    expect(screen.getByText('Semana de descarga')).toBeInTheDocument()
    expect(screen.getByText(/menos series y RIR 3–4/)).toBeInTheDocument()
  })

  it('shows on the home screen only for someone training in blocks', async () => {
    mockApi({
      'GET /auth/me': { body: { ...USER, block_weeks: 4, block: { week: 1, weeks: 4, is_deload: false } } },
    })
    renderRoute('/')
    expect(await screen.findByRole('region', { name: 'Tu bloque' })).toBeInTheDocument()
  })

  it('stays out of the way without blocks', async () => {
    mockApi({ 'GET /auth/me': { body: USER } })
    renderRoute('/')
    expect(await screen.findByRole('heading', { name: /^Hola/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Tu bloque' })).not.toBeInTheDocument()
  })
})
