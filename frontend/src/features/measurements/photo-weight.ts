export interface WeighIn {
  kg: number
  /** The day of the weigh-in, `YYYY-MM-DD`. */
  on: string
}

/** A photo is seldom taken the same day as a weigh-in: one up to this many days away still tells. */
export const MAX_DAYS_AWAY = 3

const dayNumber = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

/** The weigh-in closest to a day, at most three days away; the earlier one wins a tie. */
export function weighInNear(weights: ReadonlyMap<string, number>, day: string): WeighIn | undefined {
  const target = dayNumber(day)
  let best: (WeighIn & { distance: number }) | undefined
  for (const [on, kg] of weights) {
    const distance = Math.abs(dayNumber(on) - target)
    const better =
      best === undefined || distance < best.distance || (distance === best.distance && on < best.on)
    if (distance <= MAX_DAYS_AWAY && better) {
      best = { kg, on, distance }
    }
  }
  return best === undefined ? undefined : { kg: best.kg, on: best.on }
}
