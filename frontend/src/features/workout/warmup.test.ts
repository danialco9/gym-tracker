import { describe, expect, it } from 'vitest'
import { warmupSets } from './warmup'

describe('warmupSets', () => {
  it('ramps 40 %, 60 % and 80 % of the working weight, rounded to 2.5 kg', () => {
    expect(warmupSets(100, 'barbell')).toEqual([
      { reps: 10, weightKg: 40 },
      { reps: 5, weightKg: 60 },
      { reps: 3, weightKg: 80 },
    ])
    expect(warmupSets(85, 'machine')).toEqual([
      { reps: 10, weightKg: 35 },
      { reps: 5, weightKg: 50 },
      { reps: 3, weightKg: 67.5 },
    ])
  })

  it('never goes under the empty bar on a barbell', () => {
    expect(warmupSets(40, 'barbell')).toEqual([
      { reps: 10, weightKg: 20 },
      { reps: 5, weightKg: 25 },
      { reps: 3, weightKg: 32.5 },
    ])
  })

  it('takes a single set under 40 kg and none under 20 kg', () => {
    expect(warmupSets(30, 'dumbbell')).toEqual([{ reps: 5, weightKg: 17.5 }])
    expect(warmupSets(17.5, 'dumbbell')).toEqual([])
    expect(warmupSets(0, 'bodyweight')).toEqual([])
  })

  it('leaves out a set as heavy as the one before or as the working weight', () => {
    // 60 % of 30 kg is 18 kg, under the bar: the empty bar is still lighter than the working weight.
    expect(warmupSets(30, 'barbell')).toEqual([{ reps: 5, weightKg: 20 }])
    // On a 20 kg barbell lift the bar is the working weight itself.
    expect(warmupSets(20, 'barbell')).toEqual([])
    // 40 % and 60 % of 45 kg both stay at the bar.
    expect(warmupSets(45, 'barbell')).toEqual([
      { reps: 10, weightKg: 20 },
      { reps: 5, weightKg: 27.5 },
      { reps: 3, weightKg: 35 },
    ])
  })
})
