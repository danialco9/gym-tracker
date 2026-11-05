import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { STRENGTH_TIERS } from '@/lib/labels'
import type { StrengthTier } from '@/lib/types'
import { TierMedal } from './TierMedal'

const TIERS = Object.keys(STRENGTH_TIERS) as StrengthTier[]

/** The medal's outline and its emblem: the first and the last path after the ribbon. */
function shapeOf(tier: StrengthTier): string {
  const { container } = render(<TierMedal tier={tier} />)
  const paths = [...container.querySelectorAll('path')].map((path) => path.getAttribute('d'))
  return `${paths[2]} | ${paths.at(-1)}`
}

describe('TierMedal', () => {
  it('gives every tier a shape of its own, not only a colour', () => {
    const shapes = TIERS.map(shapeOf)

    expect(new Set(shapes).size).toBe(TIERS.length)
  })
})
