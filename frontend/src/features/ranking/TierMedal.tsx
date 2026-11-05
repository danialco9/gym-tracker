import { useId } from 'react'
import { STRENGTH_TIERS } from '@/lib/labels'
import type { StrengthTier } from '@/lib/types'
import { cn } from '@/lib/utils'

// A 48 × 48 medal: the ribbon above, the body centred below it.
const CX = 24
const CY = 30
const R = 15

type Point = [number, number]

const path = (points: Point[]) => `M${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`

/** A closed outline whose radius alternates between `outer` and `inner`, starting at the top. */
function rays(count: number, outer: number, inner: number, cx = CX, cy = CY, turn = 0): Point[] {
  return Array.from({ length: count * 2 }, (_, index) => {
    const angle = turn - Math.PI / 2 + (index * Math.PI) / count
    const radius = index % 2 === 0 ? outer : inner
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]
  })
}

const polygon = (sides: number, radius: number, turn = 0) => rays(sides / 2, radius, radius, CX, CY, turn)
const star = (cx: number, cy: number, radius: number) => path(rays(5, radius, radius * 0.45, cx, cy))
const circle = (radius: number) =>
  `M${CX - radius} ${CY}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0Z`

/**
 * Each tier changes both the outline of the medal and the emblem on it, so they tell apart by shape,
 * not by colour alone: round, double rim, scalloped, a seal; then the cut of a gem, and a star.
 */
const MEDALS: Record<StrengthTier, { body: string; emblem: string; rim?: boolean }> = {
  bronze: { body: circle(R), emblem: circle(3.5) },
  silver: { body: circle(R), emblem: star(CX, CY, 6.5), rim: true },
  gold: { body: path(rays(14, R, R - 1.6)), emblem: star(19.6, CY, 4.6) + star(28.4, CY, 4.6) },
  platinum: {
    body: path(rays(20, R + 0.5, R - 2.5)),
    emblem: star(17.4, CY + 0.6, 3.7) + star(CX, CY - 1.2, 4.2) + star(30.6, CY + 0.6, 3.7),
  },
  diamond: {
    body: path([
      [CX, 13.5],
      [40, CY],
      [CX, 46.5],
      [8, CY],
    ]),
    emblem: path([
      [CX, 22],
      [30.5, CY],
      [CX, 38],
      [17.5, CY],
    ]),
  },
  emerald: { body: path(polygon(8, R + 0.5, Math.PI / 8)), emblem: path(polygon(8, 6.5, Math.PI / 8)) },
  ruby: {
    body: path(polygon(6, R + 0.5, Math.PI / 6)),
    emblem:
      `M${CX} 36.5C${CX - 8} 31 ${CX - 7.5} 24.5 ${CX - 3.5} 24.5` +
      `C${CX - 1.6} 24.5 ${CX - 0.5} 25.8 ${CX} 27C${CX + 0.5} 25.8 ${CX + 1.6} 24.5 ${CX + 3.5} 24.5` +
      `C${CX + 7.5} 24.5 ${CX + 8} 31 ${CX} 36.5Z`,
  },
  master: {
    body: path(rays(8, R + 2, R - 4.5)),
    emblem: path([
      [17, 34.5],
      [17, 25.5],
      [20.5, 29],
      [CX, 23.5],
      [27.5, 29],
      [31, 25.5],
      [31, 34.5],
    ]),
  },
}

/** The highest tiers get an inner rim and more shine on top of their own shape. */
const SHINY: ReadonlySet<StrengthTier> = new Set(['diamond', 'emerald', 'ruby', 'master'])

/** Dark ink on the light colours (silver, gold, platinum), white on the rest. */
function inkFor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.55 ? 'rgba(11, 13, 16, 0.6)' : 'rgba(255, 255, 255, 0.92)'
}

/** The tier's medal; the name goes beside it, so the medal itself is decoration. */
export function TierMedal({ tier, className }: { tier: StrengthTier; className?: string }) {
  const { color } = STRENGTH_TIERS[tier]
  const { body, emblem, rim } = MEDALS[tier]
  const shiny = SHINY.has(tier)
  const shine = useId()

  return (
    <svg
      viewBox="0 0 48 48"
      className={cn('shrink-0', className)}
      data-tier={tier}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={shine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={shiny ? 0.5 : 0.32} />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* The ribbon: two straps crossing behind the medal. */}
      <path d="M12 1h7.5l8 19h-7.5z" fill={color} opacity={0.85} />
      <path d="M36 1h-7.5l-8 19h7.5z" fill={color} opacity={0.6} />
      <path d={body} fill={color} stroke="rgba(0, 0, 0, 0.3)" strokeWidth={1.2} strokeLinejoin="round" />
      <path d={body} fill={`url(#${shine})`} />
      {(rim || shiny) && (
        <path
          d={body}
          fill="none"
          stroke={shiny ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.25)'}
          strokeWidth={1.4}
          transform={`translate(${CX} ${CY}) scale(0.78) translate(${-CX} ${-CY})`}
        />
      )}
      <path d={emblem} fill={inkFor(color)} strokeLinejoin="round" />
    </svg>
  )
}
