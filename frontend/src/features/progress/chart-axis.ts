/** Steps a kilo axis may count in: numbers a person reads at a glance. */
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100] as const
const MAX_TICKS = 6

/**
 * Round ticks for a kilo axis, with some room above and below the data: 20, 25, 30, 35, 40
 * instead of whatever the data's own extremes give, like 18, 24, 30, 36, 41.
 */
export function roundKgTicks(values: readonly number[], padding: number): number[] {
  if (values.length === 0) {
    return []
  }
  const low = Math.min(...values) - padding
  const high = Math.max(...values) + padding
  for (const step of STEPS) {
    const first = Math.floor(low / step) * step
    const last = Math.ceil(high / step) * step
    if ((last - first) / step + 1 <= MAX_TICKS) {
      return Array.from({ length: (last - first) / step + 1 }, (_, index) => first + index * step)
    }
  }
  const step = Math.ceil((high - low) / (MAX_TICKS - 1) / 100) * 100
  const first = Math.floor(low / step) * step
  return Array.from({ length: MAX_TICKS }, (_, index) => first + index * step)
}
