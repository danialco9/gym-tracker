import { ArrowDownIcon, ArrowUpIcon, RepeatIcon, TrendingUpIcon, type LucideIcon } from 'lucide-react'
import { formatDecimal, formatKg, plural } from '@/lib/format'
import { MUSCLE_GROUP_LABELS } from '@/lib/labels'
import { formatRir } from '@/lib/rir'
import type { MuscleGroup, ProgressionAction, Recommendation, VolumeAdvice, WeeklyVolume } from '@/lib/types'

export const ACTION_ORDER: readonly ProgressionAction[] = ['increase_load', 'increase_reps', 'hold', 'deload']

export const ACTION_TITLES: Record<ProgressionAction, string> = {
  increase_load: 'Sube el peso',
  increase_reps: 'Busca más repeticiones',
  hold: 'Repite la sesión',
  deload: 'Descarga',
}

export const ACTION_ICONS: Record<ProgressionAction, LucideIcon> = {
  increase_load: ArrowUpIcon,
  increase_reps: TrendingUpIcon,
  hold: RepeatIcon,
  deload: ArrowDownIcon,
}

const hardestRpe = (item: Recommendation) => {
  const rpes = item.last_sets.flatMap((set) => (set.rpe === null ? [] : [set.rpe]))
  return rpes.length === 0 ? null : Math.max(...rpes)
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** The first planned set that fell short, as "en la serie 3 hiciste 8 de 10", or the skipped sets. */
function shortfall(item: Recommendation): string {
  const skipped = item.target_sets.length - item.last_sets.length
  if (skipped > 0) {
    return `hiciste ${item.last_sets.length} de ${item.target_sets.length} series`
  }
  const index = item.target_sets.findIndex(
    (target, position) => target.reps !== null && item.last_sets[position].reps < target.reps,
  )
  if (index === -1) {
    return 'te faltaron repeticiones'
  }
  return `en la serie ${index + 1} hiciste ${item.last_sets[index].reps} de ${item.target_sets[index].reps} repeticiones`
}

/** One sentence saying why the recommendation is what it is, from the last session's numbers. */
export function explainRecommendation(item: Recommendation): string {
  const rpe = hardestRpe(item)
  const step = formatKg(item.increment_kg)
  const range = item.rep_range
  // The hardest set is the one with the fewest reps left, so its RIR is the floor.
  const withRir = rpe === null ? '' : ` con RIR ${formatRir(rpe)} o más`
  switch (item.reason) {
    case 'targets_hit':
      return `Completaste todas las series objetivo${withRir}: sube ${step}.`
    case 'targets_hit_hard':
      return `Completaste el objetivo, pero llegaste a RIR ${formatRir(rpe ?? 10)}: repite el peso hasta que cueste menos.`
    case 'targets_missed':
      return `${capitalize(shortfall(item))}: mantén el peso hasta completarlas.`
    case 'plateau':
      return 'Tu mejor marca estimada no mejora en las últimas sesiones: baja el peso y vuelve a construir.'
    case 'easy_without_plan':
      return `Sin objetivo de repeticiones y${withRir || ' sin esfuerzo alto'}: sube ${step}.`
    case 'without_plan':
      return 'Sin objetivo de repeticiones en la rutina: busca una repetición más con el mismo peso.'
    case 'jump_too_big': {
      const heaviest = Math.max(...item.last_sets.map((set) => set.weight_kg))
      const percent = heaviest > 0 ? ` (un ${Math.round((item.increment_kg / heaviest) * 100)} % más)` : ''
      return `Subir ${step} sería un salto grande${percent}: primero suma una repetición por serie.`
    }
    case 'deload_week':
      return 'Semana de descarga: la mitad de series con el mismo peso, dejando 3 o 4 reps en reserva.'
    case 'range_top':
      return range === null
        ? 'Llegaste a lo alto del rango en todas las series: sube el peso y baja las repeticiones.'
        : `Llegaste a ${range.max} repeticiones en todas las series: sube el peso y vuelve a ${range.min}.`
    case 'below_range':
      return `Aún no llegas a ${range?.min ?? 'las'} repeticiones en todas las series: mantén el peso hasta conseguirlo.`
    case 'within_range':
      return range === null
        ? 'Mismo peso y una repetición más por serie.'
        : `Vas dentro del rango de ${range.min}–${range.max}: mismo peso y una repetición más por serie hasta llegar a ${range.max}.`
  }
}

/** One short line per muscle; the section header gives the recommended range once. */
export function explainVolume(advice: VolumeAdvice): string {
  const sets = `${formatDecimal(advice.average_hard_sets)} ${plural(advice.average_hard_sets, 'serie dura', 'series duras')} por semana`
  return advice.status === 'low'
    ? `${sets}: añade algunas en tus rutinas.`
    : `${sets}: quita algunas, pasado ${advice.max_hard_sets} suman sobre todo fatiga.`
}

export function groupRecommendations(recommendations: Recommendation[]) {
  return ACTION_ORDER.map((action) => ({
    action,
    items: recommendations
      .filter((item) => item.action === action)
      .toSorted((a, b) => a.exercise_name.localeCompare(b.exercise_name, 'es')),
  })).filter((group) => group.items.length > 0)
}

/** Stacked series beyond this many muscles fold into "Otros" (the palette has six validated slots). */
export const MAX_MUSCLE_SERIES = 6
export const OTHER_MUSCLES = 'other'
export type VolumeSeriesKey = MuscleGroup | typeof OTHER_MUSCLES

export const muscleLabel = (key: VolumeSeriesKey) =>
  key === OTHER_MUSCLES ? 'Otros' : MUSCLE_GROUP_LABELS[key]

export type VolumeRow = { week_start: string } & Partial<Record<VolumeSeriesKey, number>>

/**
 * Prepares the weekly hard-set chart. Series are the muscles with the most sets over
 * the whole period, in that order, so each keeps its colour while the data stays the same.
 */
export function buildVolume(weeks: WeeklyVolume[]) {
  const totals = new Map<MuscleGroup, number>()
  for (const week of weeks) {
    for (const { muscle_group: muscle, hard_sets: sets } of week.muscles) {
      totals.set(muscle, (totals.get(muscle) ?? 0) + sets)
    }
  }
  const ranked = [...totals.entries()]
    .toSorted(([muscleA, a], [muscleB, b]) => b - a || muscleA.localeCompare(muscleB))
    .map(([muscle]) => muscle)
  const needsOther = ranked.length > MAX_MUSCLE_SERIES
  const shown = needsOther ? ranked.slice(0, MAX_MUSCLE_SERIES - 1) : ranked
  const series: VolumeSeriesKey[] = needsOther ? [...shown, OTHER_MUSCLES] : shown

  const rows: VolumeRow[] = weeks.map((week) => {
    const row: VolumeRow = { week_start: week.week_start }
    for (const { muscle_group: muscle, hard_sets: sets } of week.muscles) {
      const key: VolumeSeriesKey = shown.includes(muscle) ? muscle : OTHER_MUSCLES
      row[key] = (row[key] ?? 0) + sets
    }
    return row
  })

  return { series, rows }
}

/** CSS colour for the n-th categorical series, in the validated slot order. */
export const seriesColor = (index: number) => `var(--chart-${index + 1})`
