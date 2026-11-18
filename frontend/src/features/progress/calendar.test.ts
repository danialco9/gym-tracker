import { describe, expect, it } from 'vitest'
import { addMonths, daysOf, formatMonth, heatLevel, localDate, monthOf } from './calendar'

describe('calendar dates', () => {
  it('moves between months across the year', () => {
    expect(monthOf('2026-11-18')).toBe('2026-11-01')
    expect(addMonths('2026-11-01', 1)).toBe('2026-12-01')
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01')
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01')
  })

  it('lists every day of a month, leap years included', () => {
    expect(daysOf('2026-11-01')).toHaveLength(30)
    expect(daysOf('2028-02-01').at(-1)).toBe('2028-02-29')
    expect(daysOf('2026-02-01').at(-1)).toBe('2026-02-28')
  })

  it('names the month in Spanish', () => {
    expect(formatMonth('2026-11-01')).toBe('Noviembre 2026')
  })

  it('reads a moment on the local clock', () => {
    expect(localDate(new Date(2026, 10, 4, 23, 30))).toBe('2026-11-04')
  })
})

describe('heatLevel', () => {
  it('shades a day darker the more working sets it had', () => {
    expect([0, 1, 9, 10, 19, 20, 29, 30, 60].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
  })
})
