import { useId } from 'react'
import { BACK_SHAPES, type BodyShape, FRONT_SHAPES } from '@/features/ranking/body-shapes'
import { STRENGTH_TIERS, ZONE_LABELS } from '@/lib/labels'
import type { StrengthTier, Zone, ZoneStanding } from '@/lib/types'
import { cn } from '@/lib/utils'

/** ``hex`` mixed with white (amount > 0) or black (amount < 0). */
function shade(hex: string, amount: number): string {
  const target = amount > 0 ? 255 : 0
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16))
  const mixed = channels.map((value) => Math.round(value + (target - value) * Math.abs(amount)))
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function Figure({
  shapes,
  label,
  tiers,
  selected,
  onSelect,
}: {
  shapes: BodyShape[]
  label: string
  tiers: Map<Zone, StrengthTier | null>
  selected: Zone | null
  onSelect?: (zone: Zone) => void
}) {
  const id = useId()
  const usedTiers = [...new Set([...tiers.values()].filter((tier) => tier !== null))]
  const gradient = (tier: StrengthTier) => `${id}-${tier}`

  return (
    <figure className="flex min-w-0 flex-1 flex-col items-center gap-3">
      <svg viewBox="-2 -2 104 208" className="h-auto w-full overflow-visible" aria-hidden>
        <defs>
          {usedTiers.map((tier) => {
            const { color } = STRENGTH_TIERS[tier]
            return (
              <linearGradient key={tier} id={gradient(tier)} x1="0" y1="0" x2="0.35" y2="1">
                <stop offset="0%" stopColor={shade(color, 0.35)} />
                <stop offset="55%" stopColor={color} />
                <stop offset="100%" stopColor={shade(color, -0.25)} />
              </linearGradient>
            )
          })}
        </defs>
        {shapes.map((shape, index) => {
          const tier = shape.zone === null ? null : (tiers.get(shape.zone) ?? null)
          const dimmed = shape.zone !== null && selected !== null && shape.zone !== selected
          const zone = shape.zone
          return (
            <polygon
              key={index}
              points={shape.points}
              data-zone={zone ?? undefined}
              fill={tier === null ? undefined : `url(#${gradient(tier)})`}
              style={
                tier === null || dimmed
                  ? undefined
                  : { filter: `drop-shadow(0 0 1.6px ${STRENGTH_TIERS[tier].color}99)` }
              }
              className={cn(
                'stroke-card transition-opacity duration-300',
                zone === null ? 'fill-muted-foreground/20' : tier === null && 'fill-muted-foreground/35',
                dimmed && 'opacity-35',
                zone !== null && onSelect !== undefined && 'cursor-pointer',
              )}
              strokeWidth={0.6}
              strokeLinejoin="round"
              onClick={zone !== null && onSelect !== undefined ? () => onSelect(zone) : undefined}
            />
          )
        })}
      </svg>
      <figcaption className="text-muted-foreground text-[0.7rem] tracking-widest uppercase">
        {label}
      </figcaption>
    </figure>
  )
}

/** The body from the front and the back, each zone filled with the colour of the user's tier in it. */
export function BodyMap({
  zones,
  selected = null,
  onSelect,
  className,
}: {
  zones: ZoneStanding[]
  selected?: Zone | null
  onSelect?: (zone: Zone) => void
  className?: string
}) {
  const tiers = new Map(zones.map((zone) => [zone.zone, zone.tier]))
  const description = zones
    .map(
      ({ zone, tier }) =>
        `${ZONE_LABELS[zone].label}: ${tier === null ? 'sin rango' : STRENGTH_TIERS[tier].label}`,
    )
    .join(', ')

  return (
    <div role="img" aria-label={`Tu rango por zona. ${description}`} className={cn('flex gap-4', className)}>
      <Figure shapes={FRONT_SHAPES} label="Frente" tiers={tiers} selected={selected} onSelect={onSelect} />
      <Figure shapes={BACK_SHAPES} label="Espalda" tiers={tiers} selected={selected} onSelect={onSelect} />
    </div>
  )
}
