import { formatKg, plural } from './format'
import type { User } from './types'

/** The bars a gym usually has: Olympic, women's and technique. */
export const BAR_CHOICES_KG = [20, 15, 10] as const

/** Every plate the server knows about, heaviest first (backend `plates.py`). */
export const PLATE_SIZES_KG = [25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5] as const

export const DEFAULT_BAR_KG = 20
export const DEFAULT_PLATES_KG: readonly number[] = [25, 20, 15, 10, 5, 2.5, 1.25]

export interface Gym {
  barKg: number
  /** Heaviest first. */
  platesKg: readonly number[]
}

/** How a weight is loaded on the bar. */
export type PlateLoad =
  | { kind: 'plates'; perSide: number[] }
  | { kind: 'bar' }
  | { kind: 'below-bar' }
  /** It cannot be loaded exactly: the closest weights that can, below and above (null if none). */
  | { kind: 'none'; lower: number | null; upper: number | null }

// Every plate size is a whole number of quarter kilos, so the search counts in quarters.
const UNIT_KG = 0.25
// The heaviest load the search looks at above the asked one, per side.
const SEARCH_ABOVE_KG = 10

/**
 * The fewest plates for each per-side load up to ``maxUnits`` quarter kilos: ``plates[u]`` lists them
 * heaviest first, or is undefined when that load cannot be made.
 */
function fewestPlates(platesKg: readonly number[], maxUnits: number): (number[] | undefined)[] {
  const best: (number[] | undefined)[] = [[]]
  for (let units = 1; units <= maxUnits; units++) {
    for (const plate of platesKg) {
      const rest = best[units - Math.round(plate / UNIT_KG)]
      const current = best[units]
      if (rest !== undefined && (current === undefined || rest.length + 1 < current.length)) {
        best[units] = [plate, ...rest].sort((a, b) => b - a)
      }
    }
  }
  return best
}

/**
 * The plates to put on each side of the bar for ``totalKg``, with the fewest plates possible. A
 * greedy pick of the heaviest plate first is not enough: with 15 and 10 kg plates, 20 kg a side is
 * 10 + 10, not 15 and stuck.
 */
export function plateLoad(totalKg: number, { barKg, platesKg }: Gym): PlateLoad {
  if (totalKg < barKg) {
    return { kind: 'below-bar' }
  }
  if (totalKg === barKg) {
    return { kind: 'bar' }
  }
  const perSideUnits = (totalKg - barKg) / 2 / UNIT_KG
  const wanted = Math.round(perSideUnits)
  const best = fewestPlates(platesKg, wanted + SEARCH_ABOVE_KG / UNIT_KG)
  const exact = best[wanted]
  if (Math.abs(perSideUnits - wanted) < 1e-9 && exact !== undefined) {
    return { kind: 'plates', perSide: exact }
  }
  const totalOf = (units: number) => barKg + 2 * units * UNIT_KG
  let lower: number | null = null
  for (let units = Math.ceil(perSideUnits) - 1; units >= 0; units--) {
    if (best[units] !== undefined) {
      lower = totalOf(units)
      break
    }
  }
  let upper: number | null = null
  for (let units = Math.floor(perSideUnits) + 1; units < best.length; units++) {
    if (best[units] !== undefined) {
      upper = totalOf(units)
      break
    }
  }
  return { kind: 'none', lower, upper }
}

/** A one-line summary: "Barra de 20 kg · 7 discos". */
export function describeGym({ barKg, platesKg }: Gym): string {
  return `Barra de ${formatKg(barKg)} · ${platesKg.length} ${plural(platesKg.length, 'disco', 'discos')}`
}

/** The user's bar and plates, or the defaults for a session saved before they existed. */
export function gymOf(user: Pick<User, 'bar_kg' | 'plates_kg'> | null | undefined): Gym {
  return {
    barKg: user?.bar_kg ?? DEFAULT_BAR_KG,
    platesKg: user?.plates_kg ?? DEFAULT_PLATES_KG,
  }
}
