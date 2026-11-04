import { describe, expect, it } from 'vitest'
import type { WorkoutSet } from '@/lib/types'
import type { DraftSet } from './draft'
import { compareSet, compareWithLastTime } from './last-time'

const draftSet = (reps: number, weightKg: number, isWarmup = false): DraftSet => ({
  id: `${reps}-${weightKg}`,
  reps,
  weightKg,
  rpe: null,
  isWarmup,
  done: false,
})

const logged = (reps: number, weightKg: number, isWarmup = false): WorkoutSet => ({
  id: reps * 1000 + weightKg,
  exercise_id: 1,
  set_number: 1,
  reps,
  weight_kg: weightKg,
  rpe: null,
  is_warmup: isWarmup,
})

describe('compareSet', () => {
  it('beats last time with one more rep at the same weight', () => {
    expect(compareSet(draftSet(9, 60), logged(8, 60))).toBe('beaten')
  })

  it('beats last time with more weight, even with fewer reps', () => {
    expect(compareSet(draftSet(6, 62.5), logged(8, 60))).toBe('beaten')
  })

  it('matches last time with the same reps and weight', () => {
    expect(compareSet(draftSet(8, 60), logged(8, 60))).toBe('matched')
  })

  it('falls below with less weight or fewer reps', () => {
    expect(compareSet(draftSet(7, 60), logged(8, 60))).toBe('below')
    expect(compareSet(draftSet(12, 57.5), logged(8, 60))).toBe('below')
  })
})

describe('compareWithLastTime', () => {
  const last = [logged(10, 40, true), logged(8, 60), logged(7, 60)]

  it('pairs working sets by order, leaving warm-ups out on both sides', () => {
    const entry = { sets: [draftSet(10, 40, true), draftSet(8, 60), draftSet(8, 60)] }

    expect(compareWithLastTime(entry, 1, last)).toEqual({ last: last[1], verdict: 'matched' })
    expect(compareWithLastTime(entry, 2, last)).toEqual({ last: last[2], verdict: 'beaten' })
  })

  it('shows nothing for a warm-up', () => {
    expect(compareWithLastTime({ sets: [draftSet(10, 40, true)] }, 0, last)).toBeNull()
  })

  it('counts a set beyond last session as extra volume', () => {
    const entry = { sets: [draftSet(8, 60), draftSet(8, 60), draftSet(8, 60)] }

    expect(compareWithLastTime(entry, 2, last)).toEqual({ last: null, verdict: 'extra' })
  })

  it('shows nothing without history', () => {
    const entry = { sets: [draftSet(8, 60)] }

    expect(compareWithLastTime(entry, 0, undefined)).toBeNull()
    expect(compareWithLastTime(entry, 0, [logged(10, 40, true)])).toBeNull()
  })
})
