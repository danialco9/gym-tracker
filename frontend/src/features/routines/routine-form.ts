import { z } from 'zod'
import { rirToRpe, rpeToRir } from '@/lib/rir'
import type { Routine, RoutineIn } from '@/lib/types'

function optionalTarget(label: string, min: number, max: number, integer = false) {
  const number = z.number({ error: `${label}: introduce un número` })
  const checked = integer ? number.int(`${label}: usa un número entero`) : number
  return checked.min(min, `${label}: mínimo ${min}`).max(max, `${label}: máximo ${max}`).nullable()
}

export const MAX_SETS_PER_EXERCISE = 20
/** Sets a newly added exercise starts with. */
export const DEFAULT_SET_COUNT = 3

// Limits mirror the API validation (RoutineSetIn and RoutineExerciseIn in backend/src/gym_tracker/schemas.py).
export const routineSetSchema = z.object({
  targetReps: optionalTarget('Reps', 1, 100, true),
  targetWeightKg: optionalTarget('Peso', 0, 1000),
  targetRir: optionalTarget('RIR', 0, 9),
})

export const routineExerciseSchema = z.object({
  exerciseId: z.number().int(),
  name: z.string(),
  sets: z
    .array(routineSetSchema)
    .max(MAX_SETS_PER_EXERCISE, `Como máximo ${MAX_SETS_PER_EXERCISE} series por ejercicio`),
})

export const routineFormSchema = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre a la rutina').max(100, 'El nombre es demasiado largo'),
  description: z.string().max(2000, 'La descripción es demasiado larga'),
  exercises: z.array(routineExerciseSchema).max(30, 'Una rutina puede tener como máximo 30 ejercicios'),
})

export type RoutineSetValues = z.infer<typeof routineSetSchema>
export type RoutineExerciseValues = z.infer<typeof routineExerciseSchema>
export type RoutineFormValues = z.infer<typeof routineFormSchema>

export const emptyRoutineForm: RoutineFormValues = { name: '', description: '', exercises: [] }

export const emptySet = (): RoutineSetValues => ({ targetReps: null, targetWeightKg: null, targetRir: null })

/** A new set repeats the previous one, so a straight or ramped plan needs little typing. */
export const nextSet = (previous: RoutineSetValues | undefined): RoutineSetValues =>
  previous ? { ...previous } : emptySet()

export function routineToForm(routine: Routine): RoutineFormValues {
  return {
    name: routine.name,
    description: routine.description ?? '',
    exercises: routine.exercises.map((item) => ({
      exerciseId: item.exercise.id,
      name: item.exercise.name,
      sets: item.sets.map((planned) => ({
        targetReps: planned.target_reps,
        targetWeightKg: planned.target_weight_kg,
        targetRir: rpeToRir(planned.target_rpe),
      })),
    })),
  }
}

export function formToRoutinePayload(values: RoutineFormValues): RoutineIn {
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    exercises: values.exercises.map((item) => ({
      exercise_id: item.exerciseId,
      sets: item.sets.map((planned) => ({
        target_reps: planned.targetReps,
        target_weight_kg: planned.targetWeightKg,
        target_rpe: rirToRpe(planned.targetRir),
      })),
    })),
  }
}

/** Reads an optional numeric input: empty means `null`, and a decimal comma is accepted. */
export function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return value
  }
  const text = String(value ?? '')
    .trim()
    .replace(',', '.')
  return text === '' ? null : Number(text)
}
