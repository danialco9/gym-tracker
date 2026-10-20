import { z } from 'zod'
import { randomId } from '@/lib/id'
import type { Exercise, PlannedSet, Routine, RoutineExercise, WorkoutIn } from '@/lib/types'

export const WEIGHT_STEP_KG = 2.5
export const DRAFT_STORAGE_KEY = 'gym-tracker:workout-draft:v1'

const MAX_REPS = 200
const MAX_WEIGHT_KG = 1000
const DEFAULT_REPS = 10

const draftSetSchema = z.object({
  id: z.string(),
  reps: z.number().int().min(0).max(MAX_REPS),
  weightKg: z.number().min(0).max(MAX_WEIGHT_KG),
  rpe: z.number().min(1).max(10).nullable(),
  isWarmup: z.boolean(),
  done: z.boolean(),
})

const plannedSetSchema = z.object({
  reps: z.number().int().nullable(),
  weightKg: z.number().nullable(),
})

const draftExerciseSchema = z.object({
  id: z.string(),
  exerciseId: z.number().int(),
  name: z.string(),
  // The routine's planned sets, shown as the target. Drafts saved before per-set plans have none.
  targets: z.array(plannedSetSchema).default([]),
  sets: z.array(draftSetSchema),
})

const workoutDraftSchema = z.object({
  // Sent as the workout's client id: however many times it is sent, the server saves it once.
  // Drafts saved before the offline queue have none and get one when they are read back.
  clientId: z.string().default(() => randomId()),
  routineId: z.number().int().nullable(),
  routineName: z.string().nullable(),
  startedAt: z.iso.datetime({ offset: true }),
  notes: z.string(),
  exercises: z.array(draftExerciseSchema),
})

export type DraftSet = z.infer<typeof draftSetSchema>
export type DraftExercise = z.infer<typeof draftExerciseSchema>
export type WorkoutDraft = z.infer<typeof workoutDraftSchema>

type SetChanges = Partial<Pick<DraftSet, 'reps' | 'weightKg' | 'rpe' | 'isWarmup'>>

/** An exercise read from a dictation, already resolved to a catalog exercise. */
export interface DictatedEntry {
  exerciseId: number
  name: string
  sets: { reps: number | null; weightKg: number | null; rpe: number | null }[]
}

export type DraftAction =
  | {
      type: 'start'
      startedAt: string
      routine?: Routine
      /** Suggested sets per exercise id, prefilled instead of the routine's plan. */
      suggestions?: ReadonlyMap<number, PlannedSet[]>
    }
  | { type: 'startDictated'; startedAt: string; entries: DictatedEntry[] }
  | { type: 'addExercise'; exercise: Pick<Exercise, 'id' | 'name'> }
  | { type: 'removeExercise'; entryId: string }
  | { type: 'addSet'; entryId: string }
  | { type: 'updateSet'; entryId: string; setId: string; changes: SetChanges }
  | { type: 'adjustSet'; entryId: string; setId: string; field: 'reps' | 'weightKg'; delta: number }
  | { type: 'toggleDone'; entryId: string; setId: string }
  | { type: 'removeSet'; entryId: string; setId: string }
  | { type: 'setNotes'; notes: string }
  | { type: 'discard' }

const newId = randomId

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function normalizeChanges(changes: SetChanges): SetChanges {
  const normalized = { ...changes }
  if (normalized.reps !== undefined) {
    normalized.reps = clamp(Math.round(normalized.reps), 0, MAX_REPS)
  }
  if (normalized.weightKg !== undefined) {
    normalized.weightKg = clamp(Math.round(normalized.weightKg * 100) / 100, 0, MAX_WEIGHT_KG)
  }
  if (normalized.rpe !== undefined && normalized.rpe !== null) {
    normalized.rpe = clamp(Math.round(normalized.rpe * 2) / 2, 1, 10)
  }
  return normalized
}

function newSet(template?: Pick<DraftSet, 'reps' | 'weightKg' | 'rpe'>): DraftSet {
  return {
    id: newId(),
    reps: template?.reps ?? DEFAULT_REPS,
    weightKg: template?.weightKg ?? 0,
    rpe: template?.rpe ?? null,
    isWarmup: false,
    done: false,
  }
}

function entryFromRoutine(item: RoutineExercise, suggested: PlannedSet[] = []): DraftExercise {
  const targets = item.sets.map((planned) => ({
    reps: planned.target_reps,
    weightKg: planned.target_weight_kg,
  }))
  // A suggestion for today wins over the routine's plan, which stays shown as the target.
  const prefill =
    suggested.length > 0 ? suggested.map((set) => ({ reps: set.reps, weightKg: set.weight_kg })) : targets
  return {
    id: newId(),
    exerciseId: item.exercise.id,
    name: item.exercise.name,
    targets,
    // Each planned set is prefilled with its own reps and weight.
    sets:
      prefill.length === 0
        ? [newSet()]
        : prefill.map((set) =>
            newSet({ reps: set.reps ?? DEFAULT_REPS, weightKg: set.weightKg ?? 0, rpe: null }),
          ),
  }
}

function updateEntry(
  draft: WorkoutDraft,
  entryId: string,
  update: (entry: DraftExercise) => DraftExercise,
): WorkoutDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((entry) => (entry.id === entryId ? update(entry) : entry)),
  }
}

function updateSet(
  draft: WorkoutDraft,
  entryId: string,
  setId: string,
  update: (set: DraftSet) => DraftSet,
): WorkoutDraft {
  return updateEntry(draft, entryId, (entry) => ({
    ...entry,
    sets: entry.sets.map((set) => (set.id === setId ? update(set) : set)),
  }))
}

export function draftReducer(draft: WorkoutDraft | null, action: DraftAction): WorkoutDraft | null {
  if (action.type === 'start') {
    return {
      clientId: newId(),
      routineId: action.routine?.id ?? null,
      routineName: action.routine?.name ?? null,
      startedAt: action.startedAt,
      notes: '',
      exercises:
        action.routine?.exercises.map((item) =>
          entryFromRoutine(item, action.suggestions?.get(item.exercise.id)),
        ) ?? [],
    }
  }
  if (action.type === 'startDictated') {
    return {
      clientId: newId(),
      routineId: null,
      routineName: null,
      startedAt: action.startedAt,
      notes: '',
      exercises: action.entries.map((entry) => ({
        id: newId(),
        exerciseId: entry.exerciseId,
        name: entry.name,
        targets: [],
        // What the text did not say keeps the usual defaults, ready to adjust on the set itself.
        sets: entry.sets.map((set) =>
          newSet({ reps: set.reps ?? DEFAULT_REPS, weightKg: set.weightKg ?? 0, rpe: set.rpe }),
        ),
      })),
    }
  }
  if (action.type === 'discard' || draft === null) {
    return null
  }

  switch (action.type) {
    case 'addExercise':
      return {
        ...draft,
        exercises: [
          ...draft.exercises,
          {
            id: newId(),
            exerciseId: action.exercise.id,
            name: action.exercise.name,
            targets: [],
            sets: [newSet()],
          },
        ],
      }
    case 'removeExercise':
      return { ...draft, exercises: draft.exercises.filter((entry) => entry.id !== action.entryId) }
    case 'addSet':
      return updateEntry(draft, action.entryId, (entry) => ({
        ...entry,
        sets: [...entry.sets, newSet(entry.sets.at(-1))],
      }))
    case 'updateSet':
      return updateSet(draft, action.entryId, action.setId, (set) => ({
        ...set,
        ...normalizeChanges(action.changes),
      }))
    case 'adjustSet':
      return updateSet(draft, action.entryId, action.setId, (set) => {
        const changes =
          action.field === 'reps'
            ? { reps: set.reps + action.delta }
            : { weightKg: set.weightKg + action.delta }
        return { ...set, ...normalizeChanges(changes) }
      })
    case 'toggleDone':
      return updateSet(draft, action.entryId, action.setId, (set) => ({ ...set, done: !set.done }))
    case 'removeSet':
      return updateEntry(draft, action.entryId, (entry) => ({
        ...entry,
        sets: entry.sets.filter((set) => set.id !== action.setId),
      }))
    case 'setNotes':
      return { ...draft, notes: action.notes }
  }
}

export function completedSetCount(draft: WorkoutDraft): number {
  return draft.exercises.reduce((total, entry) => total + entry.sets.filter((set) => set.done).length, 0)
}

/** The set to do next, in order: the first one not ticked off, with its 1-based number. */
export function nextPendingSet(
  draft: WorkoutDraft,
): { entry: DraftExercise; set: DraftSet; number: number } | null {
  for (const entry of draft.exercises) {
    const index = entry.sets.findIndex((set) => !set.done)
    if (index !== -1) {
      return { entry, set: entry.sets[index], number: index + 1 }
    }
  }
  return null
}

/** Builds the API payload with only completed sets, numbering sets per exercise. */
export function toWorkoutPayload(draft: WorkoutDraft, endedAt: string): WorkoutIn {
  const setNumbers = new Map<number, number>()
  const sets = draft.exercises.flatMap((entry) =>
    entry.sets
      .filter((set) => set.done)
      .map((set) => {
        const setNumber = (setNumbers.get(entry.exerciseId) ?? 0) + 1
        setNumbers.set(entry.exerciseId, setNumber)
        return {
          exercise_id: entry.exerciseId,
          set_number: setNumber,
          reps: set.reps,
          weight_kg: set.weightKg,
          rpe: set.rpe,
          is_warmup: set.isWarmup,
        }
      }),
  )
  return {
    client_id: draft.clientId,
    routine_id: draft.routineId,
    started_at: draft.startedAt,
    ended_at: endedAt,
    notes: draft.notes.trim() || null,
    sets,
  }
}

export function loadDraft(storage?: Storage): WorkoutDraft | null {
  try {
    const raw = (storage ?? window.localStorage).getItem(DRAFT_STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = workoutDraftSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function saveDraft(draft: WorkoutDraft | null, storage?: Storage): void {
  try {
    const target = storage ?? window.localStorage
    if (draft === null) {
      target.removeItem(DRAFT_STORAGE_KEY)
    } else {
      target.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
    }
  } catch {
    // Storage can be unavailable (private mode, quota): the draft then lives only in memory.
  }
}
