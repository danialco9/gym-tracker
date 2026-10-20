import { formatDecimal } from '@/lib/format'
import { TRAINING_GOAL_LABELS } from '@/lib/labels'
import type { GoalPlan } from '@/lib/types'

type Range = GoalPlan['rpe']

/** "6–10", or a single number when both ends match. */
export function formatRange({ min, max }: Range): string {
  const [low, high] = [formatDecimal(min), formatDecimal(max)]
  return low === high ? low : `${low}–${high}`
}

/** Whole minutes read as "2–3 min"; anything else stays in seconds ("60–90 s"). */
export function formatRest(rest: Range): string {
  if (rest.min % 60 === 0 && rest.max % 60 === 0) {
    return `${formatRange({ min: rest.min / 60, max: rest.max / 60 })} min`
  }
  return `${formatRange(rest)} s`
}

/** "Ganar músculo · RPE 8–9 · descanso 2–3 min". */
export function goalSummary(plan: GoalPlan): string {
  return [
    TRAINING_GOAL_LABELS[plan.goal].title,
    `RPE ${formatRange(plan.rpe)}`,
    `descanso ${formatRest(plan.rest_seconds)}`,
  ].join(' · ')
}
