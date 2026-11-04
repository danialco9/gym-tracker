import { describe, expect, it } from 'vitest'
import type { MuscleWeek } from '@/lib/types'
import { WEEK_VOLUME_COLORS, weekVolumeColor, weekVolumeStatus } from './week-volume'

const chest = (hardSets: number): MuscleWeek => ({
  muscle_group: 'chest',
  hard_sets: hardSets,
  min_hard_sets: 12,
  max_hard_sets: 20,
})

describe('weekVolumeStatus', () => {
  it('is low under the minimum, optimal in range and high past the maximum', () => {
    expect(weekVolumeStatus(chest(11.5))).toBe('low')
    expect(weekVolumeStatus(chest(12))).toBe('optimal')
    expect(weekVolumeStatus(chest(20))).toBe('optimal')
    expect(weekVolumeStatus(chest(20.5))).toBe('high')
  })
})

describe('weekVolumeColor', () => {
  it('leaves a muscle without sets unpainted', () => {
    expect(weekVolumeColor(chest(0))).toBeNull()
  })

  it('turns greener with every set until the minimum', () => {
    const few = weekVolumeColor(chest(2))
    const more = weekVolumeColor(chest(8))
    const green = (hex: string | null) => Number.parseInt(hex!.slice(3, 5), 16)

    expect(green(few)).toBeLessThan(green(more))
    expect(green(more)).toBeLessThan(green(WEEK_VOLUME_COLORS.optimal))
  })

  it('is full green in range and orange past it', () => {
    expect(weekVolumeColor(chest(14))).toBe(WEEK_VOLUME_COLORS.optimal)
    expect(weekVolumeColor(chest(24))).toBe(WEEK_VOLUME_COLORS.high)
  })
})
