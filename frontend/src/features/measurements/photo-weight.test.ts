import { describe, expect, it } from 'vitest'
import { weighInNear } from './photo-weight'

const WEIGHTS = new Map([
  ['2026-11-01', 80.2],
  ['2026-11-05', 79.8],
  ['2026-11-09', 79.5],
])

describe('weighInNear', () => {
  it('takes the same day when there is one', () => {
    expect(weighInNear(WEIGHTS, '2026-11-05')).toEqual({ kg: 79.8, on: '2026-11-05' })
  })

  it('takes the closest one up to three days away, the earlier on a tie', () => {
    expect(weighInNear(WEIGHTS, '2026-11-08')).toEqual({ kg: 79.5, on: '2026-11-09' })
    expect(weighInNear(WEIGHTS, '2026-11-07')).toEqual({ kg: 79.8, on: '2026-11-05' })
    expect(weighInNear(WEIGHTS, '2026-11-12')).toEqual({ kg: 79.5, on: '2026-11-09' })
  })

  it('finds none further away', () => {
    expect(weighInNear(WEIGHTS, '2026-11-13')).toBeUndefined()
    expect(weighInNear(new Map(), '2026-11-13')).toBeUndefined()
  })
})
