import type { Equipment } from '@/lib/types'

export interface WarmupSet {
  reps: number
  weightKg: number
}

/** The plates most gyms have: warm-up weights round to them. */
const ROUNDING_KG = 2.5
/** An empty Olympic bar: a barbell warm-up never goes lighter. */
const EMPTY_BAR_KG = 20
/** Lighter than this, the working sets are their own warm-up. */
const MIN_WEIGHT_KG = 20
/** From this weight up, the full ramp of three sets; below it, one is enough. */
const FULL_RAMP_KG = 40

const FULL_RAMP = [
  { share: 0.4, reps: 10 },
  { share: 0.6, reps: 5 },
  { share: 0.8, reps: 3 },
] as const
const SHORT_RAMP = [{ share: 0.6, reps: 5 }] as const

/**
 * Warm-up sets before a working weight: 40 % × 10, 60 % × 5 and 80 % × 3, rounded to 2.5 kg. A
 * working weight under 40 kg takes only the 60 % one, and one under 20 kg none. A barbell never
 * goes under the empty bar, and a weight that rounds to the one before, or to the working weight
 * itself, is left out.
 */
export function warmupSets(workingKg: number, equipment: Equipment | null): WarmupSet[] {
  if (workingKg < MIN_WEIGHT_KG) {
    return []
  }
  const ramp = workingKg < FULL_RAMP_KG ? SHORT_RAMP : FULL_RAMP
  const floor = equipment === 'barbell' ? EMPTY_BAR_KG : 0
  const sets: WarmupSet[] = []
  for (const { share, reps } of ramp) {
    const weightKg = Math.max(floor, Math.round((workingKg * share) / ROUNDING_KG) * ROUNDING_KG)
    if (weightKg < workingKg && weightKg !== sets.at(-1)?.weightKg) {
      sets.push({ reps, weightKg })
    }
  }
  return sets
}
