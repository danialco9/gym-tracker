import { formatDecimal } from '@/lib/format'

/**
 * Effort is asked as RIR (reps left in the tank), the gym-floor question, but still stored as RPE so
 * the API, recommendations and history keep one scale: RIR = 10 − RPE.
 */
export const RIR_OPTIONS = [
  { label: '0', rpe: 10 },
  { label: '1', rpe: 9 },
  { label: '2', rpe: 8 },
  { label: '3', rpe: 7 },
  { label: '4+', rpe: 6 },
] as const

/** Whether a stored RPE is the one an RIR button stands for; "4+" covers everything at RPE 6 or below. */
export const matchesRirOption = (rpe: number | null, option: (typeof RIR_OPTIONS)[number]) =>
  rpe !== null && (option.rpe === 6 ? rpe <= 6 : rpe === option.rpe)

/** "2", "1,5" or "4+" for a stored RPE; half points from older sets or dictation stay readable. */
export const formatRir = (rpe: number) => (rpe <= 6 ? '4+' : formatDecimal(10 - rpe))

/** Exact conversions for typed targets (routines), where any value is kept as is. */
export const rpeToRir = (rpe: number | null) => (rpe === null ? null : 10 - rpe)
export const rirToRpe = (rir: number | null) => (rir === null ? null : 10 - rir)

/** An RPE range turned around: RPE 8–9 is RIR 1–2. */
export const rirRange = ({ min, max }: { min: number; max: number }) => ({ min: 10 - max, max: 10 - min })
