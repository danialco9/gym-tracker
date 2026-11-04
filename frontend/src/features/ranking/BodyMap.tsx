import { BodyFigures } from '@/components/body/BodyFigures'
import { MUSCLE_ZONES } from '@/components/body/body-shapes'
import { STRENGTH_TIERS, ZONE_LABELS } from '@/lib/labels'
import type { Zone, ZoneStanding } from '@/lib/types'

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
    <BodyFigures
      label={`Tu rango por zona. ${description}`}
      className={className}
      lookOf={({ muscle }) => {
        const zone = MUSCLE_ZONES[muscle]
        const tier = tiers.get(zone) ?? null
        return {
          color: tier === null ? null : STRENGTH_TIERS[tier].color,
          dimmed: selected !== null && zone !== selected,
          selectable: true,
        }
      }}
      onSelect={onSelect && (({ muscle }) => muscle !== null && onSelect(MUSCLE_ZONES[muscle]))}
    />
  )
}
