import type { PlanDay } from '@/lib/types'

/** The day in words, for screen readers and the day sheet. */
export function describeDay(day: PlanDay): string {
  if (day.kind === 'rest') {
    return 'Descanso'
  }
  return day.kind === 'free' ? 'Entreno libre' : (day.routine?.name ?? 'Rutina')
}
