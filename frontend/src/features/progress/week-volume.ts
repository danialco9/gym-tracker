import type { MuscleWeek } from '@/lib/types'

export type WeekVolumeStatus = 'low' | 'optimal' | 'high'

/** The colours of the week's volume: filling up towards the minimum, in range, past the maximum. */
export const WEEK_VOLUME_COLORS = {
  empty: '#3f4753',
  optimal: '#22c55e',
  high: '#f97316',
} as const

export function weekVolumeStatus({ hard_sets, min_hard_sets, max_hard_sets }: MuscleWeek): WeekVolumeStatus {
  if (hard_sets > max_hard_sets) {
    return 'high'
  }
  return hard_sets >= min_hard_sets ? 'optimal' : 'low'
}

/** ``from`` blended towards ``to`` by ``amount`` (0 to 1). */
function mix(from: string, to: string, amount: number): string {
  const channel = (hex: string, start: number) => Number.parseInt(hex.slice(start, start + 2), 16)
  return `#${[1, 3, 5]
    .map((start) => Math.round(channel(from, start) + (channel(to, start) - channel(from, start)) * amount))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`
}

/**
 * The muscle's fill: none before its first set, then greener with every set until the weekly minimum,
 * full green while in range and orange past the maximum, where more sets mostly add fatigue.
 */
export function weekVolumeColor(muscle: MuscleWeek): string | null {
  if (muscle.hard_sets <= 0) {
    return null
  }
  const status = weekVolumeStatus(muscle)
  if (status !== 'low') {
    return WEEK_VOLUME_COLORS[status]
  }
  // A first set already shows a hint of green (15 % of the way), and the last step to the minimum
  // still reads apart from the full green of the range.
  const filled = 0.15 + 0.55 * (muscle.hard_sets / muscle.min_hard_sets)
  return mix(WEEK_VOLUME_COLORS.empty, WEEK_VOLUME_COLORS.optimal, filled)
}
