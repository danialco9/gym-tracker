import type { BlockWeek, MuscleGroup, MuscleWeek, RoutineExercise } from '@/lib/types'

/**
 * The exercises of today's routine that take one more set, by exercise id, as the week's target of
 * sets climbs through a training block.
 *
 * Only from the second week of a block, never in the deload. A muscle gets the set when last week
 * fell short of this week's target and this week has not reached it yet, so a routine that already
 * does enough is left alone. Only the muscle's first exercise of the day takes it: a set or two more
 * per muscle each week, the small steps the target climbs by.
 */
export function rampExercises(
  exercises: readonly RoutineExercise[],
  weekSets: readonly MuscleWeek[],
  block: BlockWeek | null | undefined,
): Set<number> {
  const ramped = new Set<number>()
  if (block == null || block.is_deload || block.week < 2) {
    return ramped
  }
  const short = new Set<MuscleGroup>(
    weekSets
      .filter(
        (muscle) =>
          muscle.last_week_hard_sets < muscle.target_hard_sets && muscle.hard_sets < muscle.target_hard_sets,
      )
      .map((muscle) => muscle.muscle_group),
  )
  for (const item of exercises) {
    if (short.delete(item.exercise.muscle_group)) {
      ramped.add(item.exercise.id)
    }
  }
  return ramped
}

/** One more set, a copy of the last; nothing to copy leaves the plan as it is. */
export const withExtraSet = <T>(sets: readonly T[]): T[] =>
  sets.length === 0 ? [...sets] : [...sets, sets[sets.length - 1]!]
