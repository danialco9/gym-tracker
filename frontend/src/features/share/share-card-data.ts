import { milestoneSentence } from '@/features/progress/milestones'
import { formatDate, formatDecimal, formatDuration, formatKg, plural } from '@/lib/format'
import type { Milestone, PersonalRecord, Workout } from '@/lib/types'

const TOP_EXERCISES = 3
// With milestones the card is fuller: one best set less keeps the footer clear.
const TOP_EXERCISES_WITH_MILESTONES = 2
const MILESTONE_LINES = 2

export interface ShareCardData {
  title: string
  date: string
  duration: string | null
  workingSets: number
  volume: string
  /** The heaviest exercises of the day, each with its heaviest set: "100 kg × 5". */
  topExercises: { name: string; bestSet: string }[]
  /** Exercises whose best estimated 1RM or heaviest weight dates from this workout's day. */
  records: number
  /** The milestones earned in this workout, at most two lines: "Primer 100 kg en Press banca". */
  milestones: string[]
}

/** `YYYY-MM-DD` of the local day the workout started, the format the API dates records with. */
function localDay(iso: string): string {
  const date = new Date(iso)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * What the share card shows. Warm-ups stay out of the sets, the volume and the best sets: they are
 * not what anyone brags about.
 */
export function shareCardData(
  workout: Workout,
  title: string,
  exerciseNames: Map<number, string>,
  records: PersonalRecord[],
  milestones: Milestone[] = [],
): ShareCardData {
  const earned = milestones.filter((milestone) => milestone.workout_id === workout.id).map(milestoneSentence)
  // A third line would push the best sets off the card: the rest are counted instead.
  const milestoneLines =
    earned.length <= MILESTONE_LINES
      ? earned
      : [earned[0], `+${earned.length - 1} ${plural(earned.length - 1, 'hito más', 'hitos más')}`]

  const working = workout.sets.filter((set) => !set.is_warmup)
  const volumeKg = working.reduce((total, set) => total + set.reps * set.weight_kg, 0)

  const best = new Map<number, { reps: number; weight_kg: number }>()
  for (const set of working) {
    const current = best.get(set.exercise_id)
    if (
      current === undefined ||
      set.weight_kg > current.weight_kg ||
      (set.weight_kg === current.weight_kg && set.reps > current.reps)
    ) {
      best.set(set.exercise_id, set)
    }
  }
  const topExercises = [...best.entries()]
    .sort(([, a], [, b]) => b.weight_kg - a.weight_kg || b.reps - a.reps)
    .slice(0, earned.length > 0 ? TOP_EXERCISES_WITH_MILESTONES : TOP_EXERCISES)
    .map(([exerciseId, set]) => ({
      name: exerciseNames.get(exerciseId) ?? 'Ejercicio',
      bestSet: set.weight_kg > 0 ? `${formatKg(set.weight_kg)} × ${set.reps}` : `${set.reps} reps`,
    }))

  const day = localDay(workout.started_at)
  const recordCount = records.filter(
    (record) => best.has(record.exercise_id) && (record.best_e1rm_on === day || record.max_weight_on === day),
  ).length

  return {
    title,
    date: formatDate(workout.started_at),
    duration: formatDuration(workout.started_at, workout.ended_at),
    workingSets: working.length,
    volume: `${formatDecimal(Math.round(volumeKg))} kg`,
    topExercises,
    records: recordCount,
    milestones: milestoneLines,
  }
}
