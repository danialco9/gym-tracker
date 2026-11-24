import { formatKg } from '@/lib/format'
import type { Milestone } from '@/lib/types'

/** "Primer 100 kg" or "+20 kg desde el inicio". */
export function milestoneTitle(milestone: Milestone): string {
  return milestone.kind === 'weight'
    ? `Primer ${formatKg(milestone.value_kg)}`
    : `+${formatKg(milestone.value_kg)} desde el inicio`
}
