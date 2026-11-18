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

/** A one-line summary: "Barra de 20 kg · 7 discos". */
export function describeGym({ barKg, platesKg }: Gym): string {
  return `Barra de ${formatKg(barKg)} · ${platesKg.length} ${plural(platesKg.length, 'disco', 'discos')}`
}

/** The user's bar and plates, or the defaults for a session saved before they existed. */
export function gymOf(user: Pick<User, 'bar_kg' | 'plates_kg'> | undefined): Gym {
  return {
    barKg: user?.bar_kg ?? DEFAULT_BAR_KG,
    platesKg: user?.plates_kg ?? DEFAULT_PLATES_KG,
  }
}
