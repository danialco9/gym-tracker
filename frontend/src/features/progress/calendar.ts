/*
 * The month calendar of workouts. Dates are `YYYY-MM-DD`, as in the week plan; a workout belongs to
 * the date it started on, on this phone's clock.
 */

const monthName = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })

const pad = (value: number) => String(value).padStart(2, '0')

/** The local date of a moment, e.g. a workout's `started_at`. */
export function localDate(moment: string | Date): string {
  const date = typeof moment === 'string' ? new Date(moment) : moment
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The first day of the date's month. */
export const monthOf = (isoDate: string) => `${isoDate.slice(0, 7)}-01`

/** The first day of the month ``months`` after (or before, if negative) ``month``. */
export function addMonths(month: string, months: number): string {
  const [year, monthIndex] = month.split('-').map(Number) as [number, number]
  const date = new Date(Date.UTC(year, monthIndex - 1 + months, 1))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-01`
}

/** Every date of the month, in order. */
export function daysOf(month: string): string[] {
  const days: string[] = []
  const [year, monthIndex] = month.split('-').map(Number) as [number, number]
  const length = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()
  for (let day = 1; day <= length; day++) {
    days.push(`${month.slice(0, 8)}${pad(day)}`)
  }
  return days
}

/** "Noviembre 2026". */
export function formatMonth(month: string): string {
  const text = monthName.format(new Date(`${month}T12:00:00Z`)).replace(' de ', ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** How hard a day was, 0 to 4, by its working sets: the shade of its square. */
export function heatLevel(workingSets: number): 0 | 1 | 2 | 3 | 4 {
  if (workingSets <= 0) return 0
  if (workingSets < 10) return 1
  if (workingSets < 20) return 2
  if (workingSets < 30) return 3
  return 4
}
