import type { DraftSet } from './draft'

// The backend's Epley formula (analysis/metrics.py), so a record here is a record there too.
const EPLEY_REPS_DIVISOR = 30

/** Estimated one-rep max, rounded to 0.1 kg like the records the API sends. */
export function estimate1rm(weightKg: number, reps: number): number {
  const e1rm = reps > 1 ? weightKg * (1 + reps / EPLEY_REPS_DIVISOR) : weightKg
  return Math.round(e1rm * 10) / 10
}

/**
 * Whether the set would beat the exercise's best estimated 1RM: the saved record, or a heavier set
 * already done in this workout. Never for an exercise without history, where every set would be one.
 */
export function beatsRecord(
  set: Pick<DraftSet, 'reps' | 'weightKg'>,
  doneSets: DraftSet[],
  bestE1rmKg?: number,
) {
  if (bestE1rmKg === undefined || set.reps < 1 || set.weightKg <= 0) {
    return false
  }
  const best = Math.max(
    bestE1rmKg,
    ...doneSets.filter((done) => !done.isWarmup).map((done) => estimate1rm(done.weightKg, done.reps)),
  )
  return estimate1rm(set.weightKg, set.reps) > best
}
