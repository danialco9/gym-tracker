/*
 * Calendar dates as the API sends them, `YYYY-MM-DD`, handled at noon UTC so no time zone or
 * daylight saving change can move them to another day.
 */

const LOCALE = 'es-ES'
const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' })
const longDay = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

/** Monday first, as the week plan: L M X J V S D. */
export const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const
export const WEEKDAY_NAMES = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
] as const

const parse = (isoDate: string) => new Date(`${isoDate}T12:00:00Z`)

export function addDays(isoDate: string, days: number): string {
  const date = parse(isoDate)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Monday is 0. */
export function weekdayOf(isoDate: string): number {
  return (parse(isoDate).getUTCDay() + 6) % 7
}

export function dayOfMonth(isoDate: string): number {
  return parse(isoDate).getUTCDate()
}

/** "9 – 15 nov", or "30 nov – 6 dic" across two months. */
export function formatWeekRange(start: string): string {
  const end = addDays(start, 6)
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  const from = sameMonth ? String(dayOfMonth(start)) : dayMonth.format(parse(start))
  return `${from} – ${dayMonth.format(parse(end))}`.replaceAll('.', '')
}

/** "Jueves, 12 de noviembre". */
export function formatLongDay(isoDate: string): string {
  const text = longDay.format(parse(isoDate))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Whether two of the days follow each other, Sunday into Monday included. */
export function hasBackToBackDays(weekdays: number[]): boolean {
  return weekdays.some((weekday) => weekdays.includes((weekday + 1) % 7))
}
