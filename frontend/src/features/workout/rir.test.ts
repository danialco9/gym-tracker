import { describe, expect, it } from 'vitest'
import { RIR_OPTIONS, formatRir, matchesRirOption } from './rir'

describe('rir', () => {
  it('stores each RIR button as RPE = 10 − RIR', () => {
    expect(RIR_OPTIONS.map((option) => [option.label, option.rpe])).toEqual([
      ['0', 10],
      ['1', 9],
      ['2', 8],
      ['3', 7],
      ['4+', 6],
    ])
  })

  it('formats a stored RPE as reps left', () => {
    expect(formatRir(10)).toBe('0')
    expect(formatRir(8)).toBe('2')
    expect(formatRir(8.5)).toBe('1,5')
    expect(formatRir(6)).toBe('4+')
    expect(formatRir(3)).toBe('4+')
  })

  it('marks "4+" for any RPE at 6 or below and the rest only on an exact match', () => {
    const [, one, , , fourPlus] = RIR_OPTIONS
    expect(matchesRirOption(5, fourPlus)).toBe(true)
    expect(matchesRirOption(6.5, fourPlus)).toBe(false)
    expect(matchesRirOption(9, one)).toBe(true)
    expect(matchesRirOption(8.5, one)).toBe(false)
    expect(matchesRirOption(null, one)).toBe(false)
  })
})
