import { describe, expect, it } from 'vitest'
import type { Routine } from '@/lib/types'
import {
  formToRoutinePayload,
  nextSet,
  parseOptionalNumber,
  routineFormSchema,
  routineToForm,
} from './routine-form'

const legDay: Routine = {
  id: 7,
  name: 'Pierna',
  description: null,
  created_at: '2026-09-15T10:00:00Z',
  exercises: [
    {
      id: 1,
      position: 1,
      sets: [
        { set_number: 1, target_reps: 10, target_weight_kg: 60, target_rpe: null },
        { set_number: 2, target_reps: 8, target_weight_kg: 70, target_rpe: 8.5 },
      ],
      exercise: {
        id: 11,
        slug: 'back-squat',
        name: 'Sentadilla con barra',
        muscle_group: 'quads',
        secondary_muscles: [],
        equipment: 'barbell',
        is_custom: false,
      },
    },
  ],
}

describe('routine form', () => {
  it('loads an existing routine and converts it back to the API payload', () => {
    const values = routineToForm(legDay)

    expect(values).toEqual({
      name: 'Pierna',
      description: '',
      exercises: [
        {
          exerciseId: 11,
          name: 'Sentadilla con barra',
          sets: [
            { targetReps: 10, targetWeightKg: 60, targetRir: null },
            { targetReps: 8, targetWeightKg: 70, targetRir: 1.5 },
          ],
        },
      ],
    })
    expect(formToRoutinePayload({ ...values, name: '  Pierna A ', description: '   ' })).toEqual({
      name: 'Pierna A',
      description: null,
      exercises: [
        {
          exercise_id: 11,
          sets: [
            { target_reps: 10, target_weight_kg: 60, target_rpe: null },
            { target_reps: 8, target_weight_kg: 70, target_rpe: 8.5 },
          ],
        },
      ],
    })
  })

  it('starts a new set as a copy of the previous one', () => {
    const previous = { targetReps: 8, targetWeightKg: 70, targetRir: null }

    expect(nextSet(previous)).toEqual(previous)
    expect(nextSet(previous)).not.toBe(previous)
    expect(nextSet(undefined)).toEqual({ targetReps: null, targetWeightKg: null, targetRir: null })
  })

  it('parses optional numeric inputs', () => {
    expect(parseOptionalNumber('')).toBeNull()
    expect(parseOptionalNumber(' 8 ')).toBe(8)
    expect(parseOptionalNumber('52,5')).toBe(52.5)
    expect(parseOptionalNumber('abc')).toBeNaN()
  })

  it('validates the name and every set with Spanish messages', () => {
    const result = routineFormSchema.safeParse({
      name: '  ',
      description: '',
      exercises: [
        {
          exerciseId: 11,
          name: 'Sentadilla',
          sets: [
            { targetReps: 1.5, targetWeightKg: Number.NaN, targetRir: 11 },
            { targetReps: 0, targetWeightKg: null, targetRir: null },
          ],
        },
      ],
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'Ponle un nombre a la rutina',
        'Reps: usa un número entero',
        'Peso: introduce un número',
        'RIR: máximo 9',
        'Reps: mínimo 1',
      ]),
    )
  })

  it('limits the number of sets per exercise', () => {
    const sets = Array.from({ length: 21 }, () => ({
      targetReps: null,
      targetWeightKg: null,
      targetRir: null,
    }))
    const result = routineFormSchema.safeParse({
      name: 'Pierna',
      description: '',
      exercises: [{ exerciseId: 11, name: 'Sentadilla', sets }],
    })

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Como máximo 20 series por ejercicio',
    ])
  })
})
