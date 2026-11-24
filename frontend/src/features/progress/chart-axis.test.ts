import { describe, expect, it } from 'vitest'

import { roundKgTicks } from './chart-axis'

describe('roundKgTicks', () => {
  it('counts in fives on a curl', () => {
    expect(roundKgTicks([22.5, 27.5, 32.1, 36.6], 2)).toEqual([20, 25, 30, 35, 40])
  })

  it('counts in twos on the body weight', () => {
    expect(roundKgTicks([79.3, 82.2], 1)).toEqual([78, 80, 82, 84])
  })

  it('takes a wider step on a heavy lift', () => {
    expect(roundKgTicks([120, 189], 2)).toEqual([100, 120, 140, 160, 180, 200])
  })

  it('has nothing to show without data', () => {
    expect(roundKgTicks([], 2)).toEqual([])
  })
})
