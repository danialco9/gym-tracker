import { formatDecimal } from '@/lib/format'
import type { ExerciseForecast, ExerciseSession } from '@/lib/types'

/** A point of the exercise chart, placed by date so a month ahead looks like a month. */
export interface ExerciseChartRow {
  /** Local midnight of the day, in milliseconds, for a time axis. */
  day: number
  best_e1rm_kg?: number
  top_weight_kg?: number
  /** The dashed trend: over the sessions it was fitted on, then a month ahead. */
  forecast_kg?: number
}

const DAY_MS = 24 * 60 * 60 * 1000
/** The weeks the backend fits the trend on. */
const TREND_WINDOW_DAYS = 56

export const dayValue = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day).getTime()
}

/**
 * The sessions, and when there is a forecast, its trend: a straight line over the sessions of the
 * last eight weeks that goes on to the expected estimate a month ahead.
 */
export function exerciseChartRows(
  sessions: readonly ExerciseSession[],
  forecast: ExerciseForecast | null,
): ExerciseChartRow[] {
  const rows: ExerciseChartRow[] = sessions.map((session) => ({
    day: dayValue(session.performed_on),
    best_e1rm_kg: session.best_e1rm_kg,
    top_weight_kg: session.top_weight_kg,
  }))
  if (forecast === null) {
    return rows
  }
  const from = dayValue(forecast.from_date)
  const end = dayValue(forecast.on)
  const perDay = (forecast.expected_kg - forecast.from_kg) / ((end - from) / DAY_MS)
  const first = rows.find((row) => row.day >= from - TREND_WINDOW_DAYS * DAY_MS)?.day ?? from
  const start = rows.find((row) => row.day === first)
  const startKg = Math.round((forecast.from_kg - (perDay * (from - first)) / DAY_MS) * 10) / 10
  if (start === undefined) {
    rows.push({ day: first, forecast_kg: startKg })
  } else {
    start.forecast_kg = startKg
  }
  rows.push({ day: end, forecast_kg: forecast.expected_kg })
  return rows
}

const kg = (value: number) => formatDecimal(Math.round(value))
// The space before % is a no-break space, so a narrow screen never leaves the % alone on a line.
const percent = (share: number) => `${formatDecimal(Math.round(Math.abs(share) * 1000) / 10)} %`

/** What the forecast says, in a sentence for the gym floor and a second one on what to do. */
export function forecastMessage(forecast: ExerciseForecast): { title: string; detail: string } {
  const range =
    kg(forecast.low_kg) === kg(forecast.high_kg)
      ? `unos ${kg(forecast.expected_kg)} kg`
      : `entre ${kg(forecast.low_kg)} y ${kg(forecast.high_kg)} kg`
  switch (forecast.trend) {
    case 'rising':
      return {
        title: `En un mes: ${range}`,
        detail: `Lo que podrías levantar a 1 repetición. Subes un ${percent(forecast.weekly_change)} por semana: sigue así.`,
      }
    case 'flat':
      return {
        title: 'Se está frenando',
        detail: `En un mes, ${range}. Prueba otro rango de reps o una semana de descarga.`,
      }
    case 'falling':
      return {
        title: 'Va a la baja',
        detail: `Bajas un ${percent(forecast.weekly_change)} por semana; en un mes, ~${kg(forecast.expected_kg)} kg. Revisa descanso, sueño y volumen.`,
      }
  }
}
