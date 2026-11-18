import { describe, expect, it } from 'vitest'
import type { BlockWeek, MuscleGroup, MuscleWeek, RoutineExercise } from '@/lib/types'
import { rampExercises, withExtraSet } from './ramp'

const exercise = (id: number, muscle: MuscleGroup): RoutineExercise => ({
  id,
  position: id,
  superset_with_next: false,
  sets: [],
  exercise: {
    id,
    slug: `exercise-${id}`,
    name: `Ejercicio ${id}`,
    muscle_group: muscle,
    secondary_muscles: [],
    equipment: null,
    is_custom: false,
    is_compound: false,
  },
})

const muscle = (group: MuscleGroup, lastWeek: number, thisWeek = 0): MuscleWeek => ({
  muscle_group: group,
  hard_sets: thisWeek,
  min_hard_sets: 12,
  max_hard_sets: 20,
  target_hard_sets: 15,
  last_week_hard_sets: lastWeek,
})

const week = (number: number, weeks = 5): BlockWeek => ({
  week: number,
  weeks,
  is_deload: number === weeks,
  target_hard_sets: 15,
})

// Two chest exercises and one for the back.
const ROUTINE = [exercise(1, 'chest'), exercise(2, 'chest'), exercise(3, 'back')]

describe('rampExercises', () => {
  it("adds a set to the first exercise of each muscle that fell short of the week's target", () => {
    expect(rampExercises(ROUTINE, [muscle('chest', 12), muscle('back', 12)], week(2))).toEqual(
      new Set([1, 3]),
    )
  })

  it('leaves alone a muscle that already reached the target last week or this one', () => {
    expect(rampExercises(ROUTINE, [muscle('chest', 16), muscle('back', 12, 15)], week(2))).toEqual(new Set())
  })

  it('only ramps from the second week of a block and never in the deload', () => {
    const short = [muscle('chest', 10)]
    expect(rampExercises(ROUTINE, short, null)).toEqual(new Set())
    expect(rampExercises(ROUTINE, short, week(1))).toEqual(new Set())
    expect(rampExercises(ROUTINE, short, week(5))).toEqual(new Set())
    expect(rampExercises(ROUTINE, short, week(4))).toEqual(new Set([1]))
  })
})

describe('withExtraSet', () => {
  it('repeats the last set, and leaves an empty plan empty', () => {
    expect(withExtraSet([{ reps: 10 }, { reps: 8 }])).toEqual([{ reps: 10 }, { reps: 8 }, { reps: 8 }])
    expect(withExtraSet([])).toEqual([])
  })
})
