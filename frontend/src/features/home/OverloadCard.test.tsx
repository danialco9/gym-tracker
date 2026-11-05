import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ExerciseOverload } from '@/lib/types'
import { OverloadCard } from './OverloadCard'

const WEEK: ExerciseOverload[] = [
  {
    exercise_id: 6,
    exercise_name: 'Press banca con barra',
    verdict: 'beaten',
    current: { weight_kg: 82.5, reps: 8 },
    previous: { weight_kg: 80, reps: 8 },
  },
  {
    exercise_id: 11,
    exercise_name: 'Sentadilla con barra',
    verdict: 'matched',
    current: { weight_kg: 100, reps: 6 },
    previous: { weight_kg: 100, reps: 6 },
  },
  {
    exercise_id: 9,
    exercise_name: 'Curl con barra',
    verdict: 'below',
    current: { weight_kg: 30, reps: 8 },
    previous: { weight_kg: 30, reps: 10 },
  },
]

describe('OverloadCard', () => {
  it('counts the exercises that beat last time and lists them on a tap', async () => {
    const user = userEvent.setup()
    render(<OverloadCard exercises={WEEK} />)

    expect(screen.getByText('1 de 3 ejercicios')).toBeInTheDocument()
    expect(screen.getByText('supera la última vez')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    expect(screen.queryByText('Press banca con barra')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ver cuáles' }))

    expect(screen.getByText('82,5 kg × 8 · antes 80 kg × 8')).toBeInTheDocument()
    expect(screen.getByText('Igual: 100 kg × 6')).toBeInTheDocument()
    expect(screen.getByText('Toca apretar · última vez 30 kg × 10')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ocultar' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows nothing while there is nothing to compare this week', () => {
    const { container } = render(<OverloadCard exercises={[]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
