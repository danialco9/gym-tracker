import { formatDecimal, formatKg } from '@/lib/format'
import { type Gym, plateLoad, type PlateLoad } from '@/lib/plates'

function describe(load: PlateLoad, barKg: number): string {
  const bar = formatKg(barKg)
  switch (load.kind) {
    case 'plates':
      return `Por lado: ${load.perSide.map(formatDecimal).join(' + ')} · barra ${bar}`
    case 'bar':
      return `Solo la barra (${bar})`
    case 'below-bar':
      return `Menos que la barra (${bar})`
    case 'none': {
      const closest = [load.lower, load.upper].filter((weight) => weight !== null).map(formatDecimal)
      return closest.length === 0
        ? 'No cuadra con tus discos'
        : `No cuadra con tus discos: ${closest.join(' o ')} kg`
    }
  }
}

/** What to put on each side of the bar for the weight on screen, with the user's bar and plates. */
export function PlateLine({ weightKg, gym }: { weightKg: number; gym: Gym }) {
  return (
    <p className="text-muted-foreground text-xs tabular-nums">
      {describe(plateLoad(weightKg, gym), gym.barKg)}
    </p>
  )
}
