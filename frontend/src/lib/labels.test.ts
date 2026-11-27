import { describe, expect, it } from 'vitest'
import { STRENGTH_TIERS } from './labels'

/** `--card` in index.css, oklch(0.21 0.014 258), in sRGB. */
const CARD = '#14191f'

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

describe('STRENGTH_TIERS', () => {
  it.each(Object.entries(STRENGTH_TIERS))('%s is readable as text on a card', (_tier, { color }) => {
    expect(contrast(color, CARD)).toBeGreaterThanOrEqual(4.5)
  })
})
