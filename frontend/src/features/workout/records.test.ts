import { describe, expect, it } from 'vitest'
import type { DraftSet } from './draft'
import { beatsRecord, estimate1rm } from './records'

const done = (weightKg: number, reps: number, isWarmup = false): DraftSet => ({
  id: `${weightKg}x${reps}`,
  reps,
  weightKg,
  rpe: null,
  isWarmup,
  done: true,
})

describe('estimate1rm', () => {
  it('uses the Epley formula, with a single rep as its own max', () => {
    expect(estimate1rm(100, 1)).toBe(100)
    expect(estimate1rm(80, 8)).toBe(101.3)
  })
})

describe('beatsRecord', () => {
  // 77.5 kg x 8 reps: 98.2 kg estimated.
  const best = estimate1rm(77.5, 8)

  it('is a record only above the best estimated max', () => {
    expect(beatsRecord({ weightKg: 80, reps: 8 }, [], best)).toBe(true)
    expect(beatsRecord({ weightKg: 77.5, reps: 8 }, [], best)).toBe(false)
    // Less weight, more reps: 72.5 kg x 12 is 101.5 kg estimated.
    expect(beatsRecord({ weightKg: 72.5, reps: 12 }, [], best)).toBe(true)
  })

  it('counts the heavier sets already done in this workout, but not warm-ups', () => {
    expect(beatsRecord({ weightKg: 80, reps: 8 }, [done(80, 8)], best)).toBe(false)
    expect(beatsRecord({ weightKg: 80, reps: 8 }, [done(85, 8, true)], best)).toBe(true)
  })

  it('needs history, reps and weight', () => {
    expect(beatsRecord({ weightKg: 80, reps: 8 }, [], undefined)).toBe(false)
    expect(beatsRecord({ weightKg: 80, reps: 0 }, [], best)).toBe(false)
    expect(beatsRecord({ weightKg: 0, reps: 20 }, [], 0)).toBe(false)
  })
})
