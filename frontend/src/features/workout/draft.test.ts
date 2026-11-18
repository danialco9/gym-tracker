import { beforeEach, describe, expect, it } from 'vitest'
import type { Routine } from '@/lib/types'
import {
  completedSetCount,
  continuesRound,
  DRAFT_STORAGE_KEY,
  draftReducer,
  loadDraft,
  nextPendingSet,
  saveDraft,
  toWorkoutPayload,
  workingSetNumber,
  type DraftAction,
  type WorkoutDraft,
} from './draft'

const STARTED_AT = '2026-09-15T16:00:00.000Z'
const ENDED_AT = '2026-09-15T17:10:00.000Z'

const legDay: Routine = {
  id: 7,
  name: 'Pierna',
  description: null,
  created_at: STARTED_AT,
  exercises: [
    {
      id: 1,
      position: 1,
      superset_with_next: false,
      sets: [1, 2, 3].map((setNumber) => ({
        set_number: setNumber,
        target_reps: 8,
        target_weight_kg: 60,
        target_rpe: 8,
      })),
      exercise: {
        id: 11,
        slug: 'back-squat',
        name: 'Sentadilla con barra',
        muscle_group: 'quads',
        secondary_muscles: ['glutes'],
        equipment: 'barbell',
        is_custom: false,
        is_compound: false,
      },
    },
  ],
}

function apply(draft: WorkoutDraft | null, ...actions: DraftAction[]): WorkoutDraft {
  const result = actions.reduce(draftReducer, draft)
  if (result === null) {
    throw new Error('Expected an active draft')
  }
  return result
}

const start = (routine?: Routine) => apply(null, { type: 'start', startedAt: STARTED_AT, routine })

describe('draftReducer', () => {
  it('prefills planned sets from the routine targets', () => {
    const draft = start(legDay)

    expect(draft.routineId).toBe(7)
    expect(draft.exercises).toHaveLength(1)
    expect(draft.exercises[0].sets.map(({ reps, weightKg, done }) => ({ reps, weightKg, done }))).toEqual([
      { reps: 8, weightKg: 60, done: false },
      { reps: 8, weightKg: 60, done: false },
      { reps: 8, weightKg: 60, done: false },
    ])
  })

  it("prefills today's suggestion over the plan, which stays as the target", () => {
    const suggestions = new Map([[11, [1, 2, 3].map(() => ({ reps: 8, weight_kg: 65 }))]])

    const [entry] = apply(null, {
      type: 'start',
      startedAt: STARTED_AT,
      routine: legDay,
      suggestions,
    }).exercises

    expect(entry.sets.map(({ reps, weightKg }) => [reps, weightKg])).toEqual([
      [8, 65],
      [8, 65],
      [8, 65],
    ])
    expect(entry.targets).toEqual([1, 2, 3].map(() => ({ reps: 8, weightKg: 60 })))
  })

  it('prefills each planned set with its own reps and weight', () => {
    const pyramid: Routine = {
      ...legDay,
      exercises: [
        {
          ...legDay.exercises[0],
          sets: [
            { set_number: 1, target_reps: 10, target_weight_kg: 60, target_rpe: null },
            { set_number: 2, target_reps: 8, target_weight_kg: 70, target_rpe: null },
            { set_number: 3, target_reps: null, target_weight_kg: null, target_rpe: 9 },
          ],
        },
      ],
    }

    const [entry] = start(pyramid).exercises

    expect(entry.targets).toEqual([
      { reps: 10, weightKg: 60 },
      { reps: 8, weightKg: 70 },
      { reps: null, weightKg: null },
    ])
    expect(entry.sets.map(({ reps, weightKg }) => [reps, weightKg])).toEqual([
      [10, 60],
      [8, 70],
      [10, 0],
    ])
  })

  it('starts an exercise without planned sets with one empty set', () => {
    const noPlan: Routine = { ...legDay, exercises: [{ ...legDay.exercises[0], sets: [] }] }

    expect(start(noPlan).exercises[0].sets).toHaveLength(1)
  })

  it('copies the previous set and clamps adjustments', () => {
    let draft = apply(start(), { type: 'addExercise', exercise: { id: 5, name: 'Prensa de piernas' } })
    const entryId = draft.exercises[0].id
    const firstSetId = draft.exercises[0].sets[0].id

    draft = apply(
      draft,
      { type: 'adjustSet', entryId, setId: firstSetId, field: 'weightKg', delta: -2.5 },
      { type: 'updateSet', entryId, setId: firstSetId, changes: { weightKg: 120.004, reps: 12 } },
      { type: 'addSet', entryId },
    )
    const secondSetId = draft.exercises[0].sets[1].id
    draft = apply(draft, { type: 'adjustSet', entryId, setId: secondSetId, field: 'reps', delta: 1 })

    expect(draft.exercises[0].sets.map(({ reps, weightKg }) => [reps, weightKg])).toEqual([
      [12, 120],
      [13, 120],
    ])
  })

  it('removes sets and exercises and discards the draft', () => {
    const draft = start(legDay)
    const entry = draft.exercises[0]

    expect(
      apply(draft, { type: 'removeSet', entryId: entry.id, setId: entry.sets[0].id }).exercises[0].sets,
    ).toHaveLength(2)
    expect(apply(draft, { type: 'removeExercise', entryId: entry.id }).exercises).toEqual([])
    expect(draftReducer(draft, { type: 'discard' })).toBeNull()
  })

  it('puts a removed exercise or set back where it was', () => {
    const draft = apply(start(legDay), { type: 'addExercise', exercise: { id: 12, name: 'Prensa' } })
    const [squat] = draft.exercises
    const middle = squat.sets[1]

    const withoutSquat = apply(draft, { type: 'removeExercise', entryId: squat.id })
    expect(apply(withoutSquat, { type: 'restoreExercise', entry: squat, index: 0 })).toEqual(draft)

    const withoutSet = apply(draft, { type: 'removeSet', entryId: squat.id, setId: middle.id })
    expect(apply(withoutSet, { type: 'restoreSet', entryId: squat.id, set: middle, index: 1 })).toEqual(draft)
  })

  it('swaps an exercise in its place, with the reps of the plan and the weights of last time', () => {
    const draft = apply(start(legDay), { type: 'addExercise', exercise: { id: 20, name: 'Curl femoral' } })
    const [squat] = draft.exercises
    const press = { id: 12, name: 'Prensa de piernas' }

    const swapped = apply(draft, {
      type: 'swapExercise',
      entryId: squat.id,
      exercise: press,
      replacementId: 'press',
      weightsKg: [150, 140],
    })

    expect(swapped.exercises.map((entry) => entry.name)).toEqual(['Prensa de piernas', 'Curl femoral'])
    const [replacement] = swapped.exercises
    expect(replacement.targets).toEqual(Array(3).fill({ reps: 8, weightKg: null }))
    // Set by set; the last weight known carries on.
    expect(replacement.sets.map((set) => [set.reps, set.weightKg])).toEqual([
      [8, 150],
      [8, 140],
      [8, 140],
    ])

    expect(apply(swapped, { type: 'undoSwap', original: squat, replacementId: 'press' })).toEqual(draft)
  })

  it('keeps the sets already done with the original, and moves the rest to the replacement', () => {
    let draft = start(legDay)
    const squat = draft.exercises[0]
    draft = apply(draft, { type: 'toggleDone', entryId: squat.id, setId: squat.sets[0].id })
    const before = draft.exercises[0]

    const swapped = apply(draft, {
      type: 'swapExercise',
      entryId: squat.id,
      exercise: { id: 12, name: 'Prensa de piernas' },
      replacementId: 'press',
      weightsKg: [],
    })

    const [original, replacement] = swapped.exercises
    expect(original.sets).toEqual([before.sets[0]])
    expect(original.targets).toHaveLength(1)
    expect(replacement.name).toBe('Prensa de piernas')
    // Never done before: no weight to go on, rather than the squat's.
    expect(replacement.sets.map((set) => [set.reps, set.weightKg, set.done])).toEqual([
      [8, 0, false],
      [8, 0, false],
    ])
    expect(replacement.targets).toHaveLength(2)

    expect(apply(swapped, { type: 'undoSwap', original: before, replacementId: 'press' })).toEqual(draft)
  })

  it('ticks several sets at once and unticks only those to undo it', () => {
    let draft = start(legDay)
    const entry = draft.exercises[0]
    const [first, second, third] = entry.sets
    draft = apply(draft, { type: 'toggleDone', entryId: entry.id, setId: first.id })

    const pending = [second.id, third.id]
    draft = apply(draft, { type: 'markDone', entryId: entry.id, setIds: pending, done: true })
    expect(draft.exercises[0].sets.map((set) => set.done)).toEqual([true, true, true])

    draft = apply(draft, { type: 'markDone', entryId: entry.id, setIds: pending, done: false })
    expect(draft.exercises[0].sets.map((set) => set.done)).toEqual([true, false, false])
  })
})

describe('warm-ups', () => {
  const [squatItem] = legDay.exercises
  const compound = (id: number, name: string, weightKg: number, muscle: 'quads' | 'chest') => ({
    ...squatItem,
    id,
    sets: squatItem.sets.map((set) => ({ ...set, target_weight_kg: weightKg })),
    exercise: { ...squatItem.exercise, id: id * 10, name, muscle_group: muscle, is_compound: true },
  })
  // A squat at 60 kg, a leg press after it for the same quads, and a light bench press.
  const warmedUpDay: Routine = {
    ...legDay,
    exercises: [
      compound(1, 'Sentadilla', 60, 'quads'),
      compound(2, 'Prensa', 120, 'quads'),
      compound(3, 'Press banca', 17.5, 'chest'),
      // Not multi-joint: never warmed up.
      { ...squatItem, id: 4, exercise: { ...squatItem.exercise, id: 40, muscle_group: 'chest' } },
    ],
  }
  const warmups = (entry: WorkoutDraft['exercises'][number]) =>
    entry.sets.filter((set) => set.isWarmup).map((set) => [set.reps, set.weightKg])

  it('warms up the first multi-joint lift of each muscle, ahead of its working sets', () => {
    const [squat, press, bench, other] = start(warmedUpDay).exercises

    expect(squat.sets.map((set) => [set.isWarmup, set.reps, set.weightKg])).toEqual([
      [true, 10, 25],
      [true, 5, 35],
      [true, 3, 47.5],
      [false, 8, 60],
      [false, 8, 60],
      [false, 8, 60],
    ])
    // The squat already warmed up the quads; the bench is too light to need it; the last is single-joint.
    expect([press, bench, other].map(warmups)).toEqual([[], [], []])
    // The targets stay the working sets'.
    expect(squat.targets).toHaveLength(3)
  })

  it('numbers only the working sets', () => {
    let draft = start(warmedUpDay)
    const squat = draft.exercises[0]
    expect(squat.sets.map((_, index) => workingSetNumber(squat.sets, index))).toEqual([0, 0, 0, 1, 2, 3])

    draft = apply(draft, {
      type: 'markDone',
      entryId: squat.id,
      setIds: squat.sets.slice(0, 3).map((set) => set.id),
      done: true,
    })
    expect(nextPendingSet(draft)).toMatchObject({ number: 1, set: { isWarmup: false } })
  })

  it('leaves the warm-ups still to do behind when swapping the exercise', () => {
    let draft = start(warmedUpDay)
    const squat = draft.exercises[0]
    draft = apply(draft, { type: 'toggleDone', entryId: squat.id, setId: squat.sets[0].id })

    const swapped = apply(draft, {
      type: 'swapExercise',
      entryId: squat.id,
      exercise: { id: 12, name: 'Hack squat' },
      replacementId: 'hack',
      weightsKg: [100],
    })

    const [original, replacement] = swapped.exercises
    // The warm-up done stays; no working set was done, so no target goes with it.
    expect(original.sets.map((set) => set.isWarmup)).toEqual([true])
    expect(original.targets).toEqual([])
    expect(replacement.sets.map((set) => [set.isWarmup, set.weightKg])).toEqual([
      [false, 100],
      [false, 100],
      [false, 100],
    ])
    expect(replacement.targets).toHaveLength(3)
  })
})

describe('supersets', () => {
  const [squatItem] = legDay.exercises
  const item = (id: number, name: string, sets: number, supersetWithNext: boolean) => ({
    ...squatItem,
    id,
    superset_with_next: supersetWithNext,
    sets: squatItem.sets.slice(0, 1).flatMap((set) => Array.from({ length: sets }, () => set)),
    exercise: { ...squatItem.exercise, id: id * 10, name },
  })
  // A bench and row superset (the row a set short), a circuit of three, then one on its own.
  const upperDay: Routine = {
    ...legDay,
    exercises: [
      item(1, 'Banca', 3, true),
      item(2, 'Remo', 2, false),
      item(3, 'Militar', 2, true),
      item(4, 'Dominadas', 2, true),
      item(5, 'Fondos', 2, false),
      item(6, 'Curl', 2, false),
    ],
  }
  const doneOnce = (draft: WorkoutDraft, entry: WorkoutDraft['exercises'][number]) =>
    apply(draft, { type: 'toggleDone', entryId: entry.id, setId: entry.sets.find((set) => !set.done)!.id })
  const name = (entry: WorkoutDraft['exercises'][number] | null | undefined) => entry?.name ?? null

  it('groups the exercises joined in the routine', () => {
    const [bench, row, press, pullUp, dip, curl] = start(upperDay).exercises

    expect(bench.superset).toBeDefined()
    expect(row.superset).toBe(bench.superset)
    expect(press.superset).toBeDefined()
    expect([pullUp.superset, dip.superset]).toEqual([press.superset, press.superset])
    expect(press.superset).not.toBe(bench.superset)
    expect(curl.superset).toBeUndefined()
  })

  it('alternates the sets of a superset, resting only after the round', () => {
    let draft = start(upperDay)
    const [bench, row] = draft.exercises

    draft = doneOnce(draft, bench)
    expect(name(continuesRound(draft, bench.id))).toBe('Remo')
    expect(name(nextPendingSet(draft, bench.id)?.entry)).toBe('Remo')

    draft = doneOnce(draft, draft.exercises[1])
    // The round is over: rest, then back to the bench.
    expect(continuesRound(draft, row.id)).toBeNull()
    expect(name(nextPendingSet(draft, row.id)?.entry)).toBe('Banca')

    draft = doneOnce(draft, draft.exercises[0])
    draft = doneOnce(draft, draft.exercises[1])
    // The row is done: the bench's last set is a round of its own, and then the circuit follows.
    draft = doneOnce(draft, draft.exercises[0])
    expect(continuesRound(draft, bench.id)).toBeNull()
    expect(name(nextPendingSet(draft, bench.id)?.entry)).toBe('Militar')
  })

  it('goes round a circuit of three before resting', () => {
    let draft = start(upperDay)
    const [, , press, pullUp, dip] = draft.exercises

    draft = doneOnce(draft, press)
    expect(name(continuesRound(draft, press.id))).toBe('Dominadas')
    draft = doneOnce(draft, draft.exercises[3])
    expect(name(continuesRound(draft, pullUp.id))).toBe('Fondos')
    draft = doneOnce(draft, draft.exercises[4])
    expect(continuesRound(draft, dip.id)).toBeNull()
    expect(name(nextPendingSet(draft, dip.id)?.entry)).toBe('Militar')
  })

  it('starts at the top, and an exercise on its own never continues a round', () => {
    const draft = start(upperDay)
    expect(name(nextPendingSet(draft)?.entry)).toBe('Banca')
    expect(continuesRound(draft, draft.exercises[5].id)).toBeNull()
  })

  it('keeps a swapped exercise in its superset', () => {
    const draft = start(upperDay)
    const row = draft.exercises[1]

    const swapped = apply(draft, {
      type: 'swapExercise',
      entryId: row.id,
      exercise: { id: 99, name: 'Remo en polea' },
      replacementId: 'cable-row',
      weightsKg: [],
    })

    expect(swapped.exercises[1].superset).toBe(row.superset)
    expect(name(continuesRound(doneOnce(swapped, swapped.exercises[0]), swapped.exercises[0].id))).toBe(
      'Remo en polea',
    )
  })
})

describe('nextPendingSet', () => {
  it('is the first set not ticked off, across exercises, until none is left', () => {
    let draft = apply(start(legDay), { type: 'addExercise', exercise: { id: 12, name: 'Prensa' } })
    const [squat, press] = draft.exercises
    draft = apply(
      draft,
      { type: 'toggleDone', entryId: squat.id, setId: squat.sets[0].id },
      { type: 'toggleDone', entryId: squat.id, setId: squat.sets[2].id },
    )

    expect(nextPendingSet(draft)).toMatchObject({ entry: { name: 'Sentadilla con barra' }, number: 2 })

    draft = apply(draft, { type: 'toggleDone', entryId: squat.id, setId: squat.sets[1].id })
    expect(nextPendingSet(draft)).toMatchObject({ entry: { name: 'Prensa' }, number: 1 })

    draft = apply(draft, { type: 'toggleDone', entryId: press.id, setId: press.sets[0].id })
    expect(nextPendingSet(draft)).toBeNull()
  })

  it('goes on from the exercise in hand, then wraps round to the ones skipped', () => {
    let draft = apply(
      start(legDay),
      { type: 'addExercise', exercise: { id: 12, name: 'Prensa' } },
      { type: 'addExercise', exercise: { id: 13, name: 'Curl femoral' } },
    )
    const [, press, curl] = draft.exercises
    draft = apply(draft, { type: 'addSet', entryId: press.id })

    // The squat rack is taken, so the workout starts on the leg press.
    draft = apply(draft, { type: 'toggleDone', entryId: press.id, setId: press.sets[0].id })
    expect(nextPendingSet(draft, press.id)).toMatchObject({ entry: { name: 'Prensa' }, number: 2 })

    const pressDone = draft.exercises[1].sets[1]
    draft = apply(draft, { type: 'toggleDone', entryId: press.id, setId: pressDone.id })
    expect(nextPendingSet(draft, press.id)).toMatchObject({ entry: { name: 'Curl femoral' }, number: 1 })

    draft = apply(draft, { type: 'toggleDone', entryId: curl.id, setId: curl.sets[0].id })
    expect(nextPendingSet(draft, curl.id)).toMatchObject({
      entry: { name: 'Sentadilla con barra' },
      number: 1,
    })
  })
})

describe('toWorkoutPayload', () => {
  it('sends only completed sets, numbered per exercise', () => {
    let draft = start(legDay)
    const entry = draft.exercises[0]
    draft = apply(
      draft,
      { type: 'toggleDone', entryId: entry.id, setId: entry.sets[0].id },
      { type: 'toggleDone', entryId: entry.id, setId: entry.sets[2].id },
      { type: 'addExercise', exercise: { id: 11, name: 'Sentadilla con barra' } },
      { type: 'setNotes', notes: '   ' },
    )
    const extra = draft.exercises[1]
    draft = apply(draft, { type: 'toggleDone', entryId: extra.id, setId: extra.sets[0].id })

    const payload = toWorkoutPayload(draft, ENDED_AT)

    expect(completedSetCount(draft)).toBe(3)
    expect(payload).toMatchObject({ routine_id: 7, started_at: STARTED_AT, ended_at: ENDED_AT, notes: null })
    expect(payload.sets.map((set) => [set.exercise_id, set.set_number, set.weight_kg])).toEqual([
      [11, 1, 60],
      [11, 2, 60],
      [11, 3, 0],
    ])
  })

  it('names the workout with the draft client id, the same however many times it is sent', () => {
    const draft = start(legDay)

    expect(draft.clientId).toMatch(/^[0-9a-f-]{36}$/)
    expect(toWorkoutPayload(draft, ENDED_AT).client_id).toBe(draft.clientId)
    expect(toWorkoutPayload(draft, ENDED_AT).client_id).not.toBe(start(legDay).clientId)
  })
})

describe('draft storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('restores a saved draft and clears it', () => {
    const draft = start(legDay)

    saveDraft(draft)
    expect(loadDraft()).toEqual(draft)

    saveDraft(null)
    expect(loadDraft()).toBeNull()
  })

  it('keeps a draft saved before routines planned each set', () => {
    const draft = start(legDay)
    const { targets: _targets, ...oldEntry } = draft.exercises[0]
    const oldDraft = {
      ...draft,
      exercises: [{ ...oldEntry, targetSets: 3, targetReps: 8, targetWeightKg: 60 }],
    }
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(oldDraft))

    expect(loadDraft()?.exercises[0]).toEqual({ ...oldEntry, targets: [] })
  })

  it('gives a draft saved before the offline queue a client id of its own', () => {
    const { clientId: _clientId, ...oldDraft } = start(legDay)
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(oldDraft))

    expect(loadDraft()?.clientId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('ignores corrupt or outdated data', () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, '{not json')
    expect(loadDraft()).toBeNull()

    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ startedAt: 'yesterday' }))
    expect(loadDraft()).toBeNull()
  })
})
