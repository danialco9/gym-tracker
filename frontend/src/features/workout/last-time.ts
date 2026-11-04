import type { DraftSet, DraftExercise } from './draft'
import type { WorkoutSet } from '@/lib/types'

export type LastTimeVerdict = 'beaten' | 'matched' | 'below' | 'extra'

export interface LastTimeComparison {
  /** The same working set last session; null when this set is one more than last time. */
  last: Pick<WorkoutSet, 'reps' | 'weight_kg'> | null
  verdict: LastTimeVerdict
}

/**
 * Progressive overload set by set: more weight, or more reps with the same weight, beats last time.
 * Adding weight counts even with fewer reps, as double progression drops the reps when the load goes up.
 */
export function compareSet(
  set: Pick<DraftSet, 'reps' | 'weightKg'>,
  last: Pick<WorkoutSet, 'reps' | 'weight_kg'>,
): LastTimeVerdict {
  if (set.weightKg > last.weight_kg || (set.weightKg === last.weight_kg && set.reps > last.reps)) {
    return 'beaten'
  }
  return set.weightKg === last.weight_kg && set.reps === last.reps ? 'matched' : 'below'
}

/**
 * How a working set of this workout stands against the same set (by order, warm-ups left out) of the
 * exercise's last session. Null for a warm-up, or when the exercise has no history.
 */
export function compareWithLastTime(
  entry: Pick<DraftExercise, 'sets'>,
  index: number,
  lastSets: WorkoutSet[] | undefined,
): LastTimeComparison | null {
  const set = entry.sets[index]
  if (set === undefined || set.isWarmup || lastSets === undefined) {
    return null
  }
  const lastWorking = lastSets.filter((done) => !done.is_warmup)
  if (lastWorking.length === 0) {
    return null
  }
  const workingIndex = entry.sets.slice(0, index).filter((earlier) => !earlier.isWarmup).length
  const last = lastWorking[workingIndex]
  if (last === undefined) {
    return { last: null, verdict: 'extra' }
  }
  return { last, verdict: compareSet(set, last) }
}
