import { describe, expect, it } from 'vitest'
import type { Exercise, Workout } from '@/lib/types'
import {
  alternativesFor,
  applyFilters,
  type ExerciseFilters,
  filterExercises,
  recentExercises,
} from './exercise-search'

function exercise(
  id: number,
  name: string,
  muscle_group: Exercise['muscle_group'],
  equipment: Exercise['equipment'],
) {
  return {
    id,
    slug: `exercise-${id}`,
    name,
    muscle_group,
    equipment,
    secondary_muscles: [],
    is_custom: false,
  }
}

const EXERCISES: Exercise[] = [
  exercise(1, 'Jalón al pecho', 'back', 'cable'),
  exercise(2, 'Prensa de piernas', 'quads', 'machine'),
  exercise(3, 'Press banca con barra', 'chest', 'barbell'),
]

const names = (query: string) => filterExercises(EXERCISES, query).map((item) => item.name)

describe('filterExercises', () => {
  it('returns everything for an empty query', () => {
    expect(names('  ')).toHaveLength(3)
  })

  it('ignores accents and case', () => {
    expect(names('JALON')).toEqual(['Jalón al pecho'])
  })

  it('matches muscle group and equipment labels', () => {
    expect(names('pecho')).toEqual(['Jalón al pecho', 'Press banca con barra'])
    expect(names('maquina prensa')).toEqual(['Prensa de piernas'])
  })
})

describe('applyFilters', () => {
  const filtered = (filters: ExerciseFilters) => applyFilters(EXERCISES, filters).map((item) => item.name)

  it('keeps everything without filters', () => {
    expect(filtered({ muscle: null, equipment: null })).toHaveLength(3)
  })

  it('filters by primary muscle, not by words in the name', () => {
    // "Jalón al pecho" mentions the chest but trains the back.
    expect(filtered({ muscle: 'chest', equipment: null })).toEqual(['Press banca con barra'])
  })

  it('combines muscle and equipment', () => {
    expect(filtered({ muscle: 'quads', equipment: 'machine' })).toEqual(['Prensa de piernas'])
    expect(filtered({ muscle: 'quads', equipment: 'barbell' })).toEqual([])
  })
})

describe('recentExercises', () => {
  const workout = (id: number, exerciseIds: number[]): Workout => ({
    id,
    routine_id: null,
    started_at: '2026-09-20T10:00:00Z',
    ended_at: null,
    notes: null,
    sets: exerciseIds.map((exercise_id, index) => ({
      id: id * 100 + index,
      exercise_id,
      set_number: index + 1,
      reps: 10,
      weight_kg: 50,
      rpe: null,
      is_warmup: false,
    })),
  })

  it('lists each exercise once, newest workout first', () => {
    const recent = recentExercises([workout(2, [3, 3, 1]), workout(1, [2, 3])], EXERCISES)

    expect(recent.map((item) => item.id)).toEqual([3, 1, 2])
  })

  it('stops at the limit and skips exercises that are no longer in the catalog', () => {
    expect(recentExercises([workout(1, [99, 2, 1, 3])], EXERCISES, 2).map((item) => item.id)).toEqual([2, 1])
  })
})

describe('alternativesFor', () => {
  const squat: Exercise = {
    ...exercise(10, 'Sentadilla con barra', 'quads', 'barbell'),
    secondary_muscles: ['glutes', 'hamstrings'],
  }
  const catalog: Exercise[] = [
    squat,
    {
      ...exercise(11, 'Sentadilla en Smith', 'quads', 'smith_machine'),
      secondary_muscles: ['glutes', 'hamstrings'],
    },
    {
      ...exercise(12, 'Sentadilla frontal', 'quads', 'barbell'),
      secondary_muscles: ['glutes', 'hamstrings'],
    },
    { ...exercise(13, 'Prensa de piernas', 'quads', 'machine'), secondary_muscles: ['glutes'] },
    exercise(14, 'Extensión de cuádriceps', 'quads', 'machine'),
    { ...exercise(15, 'Peso muerto rumano', 'hamstrings', 'barbell'), secondary_muscles: ['glutes'] },
  ]
  const names = (items: Exercise[]) => items.map((item) => item.name)

  it('offers the same muscle, the closest movement first and other equipment before the same', () => {
    expect(names(alternativesFor(squat, catalog))).toEqual([
      'Sentadilla en Smith',
      'Sentadilla frontal',
      'Prensa de piernas',
      'Extensión de cuádriceps',
    ])
  })

  it('leaves out what the workout already has, and stops at the limit', () => {
    expect(names(alternativesFor(squat, catalog, new Set([11]), 2))).toEqual([
      'Sentadilla frontal',
      'Prensa de piernas',
    ])
  })
})
