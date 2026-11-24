import { formatKg } from '@/lib/format'
import type { Milestone } from '@/lib/types'

/** "Primer 100 kg en Press banca" or "+20 kg en Press banca desde el inicio". */
export function milestoneSentence(milestone: Milestone): string {
  return milestone.kind === 'weight'
    ? `Primer ${formatKg(milestone.value_kg)} en ${milestone.exercise_name}`
    : `+${formatKg(milestone.value_kg)} en ${milestone.exercise_name} desde el inicio`
}

/**
 * What the toast after saving says about the milestones of that workout, if it earned any: one
 * sentence for one, a count and the list for several.
 */
export function celebration(
  milestones: Milestone[],
  workoutId: number,
): { title: string; description?: string } | null {
  const earned = milestones.filter((milestone) => milestone.workout_id === workoutId)
  if (earned.length === 0) {
    return null
  }
  if (earned.length === 1) {
    return { title: `¡${milestoneSentence(earned[0])}!` }
  }
  // One line per exercise, so its name is said once: "Remo: primer 80 kg y +20 kg desde el inicio".
  const byExercise = new Map<string, Milestone[]>()
  for (const milestone of earned) {
    byExercise.set(milestone.exercise_name, [...(byExercise.get(milestone.exercise_name) ?? []), milestone])
  }
  const lines = [...byExercise].map(([name, items]) => {
    const titles = items.map((item) => milestoneTitle(item).replace(/^Primer/, 'primer'))
    return `${name}: ${titles.join(' y ')}`
  })
  return { title: `¡${earned.length} hitos nuevos!`, description: lines.join(' · ') }
}

/** "Primer 100 kg" or "+20 kg desde el inicio". */
export function milestoneTitle(milestone: Milestone): string {
  return milestone.kind === 'weight'
    ? `Primer ${formatKg(milestone.value_kg)}`
    : `+${formatKg(milestone.value_kg)} desde el inicio`
}
