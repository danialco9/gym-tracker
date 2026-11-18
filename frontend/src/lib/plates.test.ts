import { describe, expect, it } from 'vitest'
import { DEFAULT_PLATES_KG, describeGym, gymOf, plateLoad } from './plates'

const STANDARD = { barKg: 20, platesKg: DEFAULT_PLATES_KG }

describe('plateLoad', () => {
  it('loads each side with the fewest plates', () => {
    expect(plateLoad(80, STANDARD)).toEqual({ kind: 'plates', perSide: [25, 5] })
    expect(plateLoad(102.5, STANDARD)).toEqual({ kind: 'plates', perSide: [25, 15, 1.25] })
    expect(plateLoad(140, STANDARD)).toEqual({ kind: 'plates', perSide: [25, 25, 10] })
  })

  it('finds a load the heaviest-first pick would miss', () => {
    // 20 kg a side: 15 first leaves 5, which this gym cannot make.
    expect(plateLoad(60, { barKg: 20, platesKg: [15, 10] })).toEqual({ kind: 'plates', perSide: [10, 10] })
  })

  it('says when only the bar or less than it is asked for', () => {
    expect(plateLoad(20, STANDARD)).toEqual({ kind: 'bar' })
    expect(plateLoad(17.5, STANDARD)).toEqual({ kind: 'below-bar' })
    expect(plateLoad(15, { barKg: 15, platesKg: [5] })).toEqual({ kind: 'bar' })
  })

  it('offers the closest weights that can be loaded when it does not fit', () => {
    expect(plateLoad(61, STANDARD)).toEqual({ kind: 'none', lower: 60, upper: 62.5 })
    // Only 10 kg plates: 50 kg goes between 40 and 60.
    expect(plateLoad(50, { barKg: 20, platesKg: [10] })).toEqual({ kind: 'none', lower: 40, upper: 60 })
  })
})

describe('gymOf', () => {
  it('fills in the defaults for a session saved before the setting', () => {
    expect(gymOf({})).toEqual(STANDARD)
    expect(describeGym(gymOf({ bar_kg: 15, plates_kg: [20] }))).toBe('Barra de 15 kg · 1 disco')
  })
})
