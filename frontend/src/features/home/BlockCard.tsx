import { BatteryChargingIcon, LayersIcon } from 'lucide-react'
import type { BlockWeek } from '@/lib/types'
import { cn } from '@/lib/utils'

function blockHint({ week, weeks }: BlockWeek) {
  const left = weeks - week
  return left === 1 ? 'Descarga la semana que viene' : `Descarga en ${left} semanas`
}

/**
 * Where this week falls in the training block: one segment per week, the last one the deload. In the
 * deload week the card turns into the reminder to train lighter.
 */
export function BlockCard({ block }: { block: BlockWeek }) {
  const Icon = block.is_deload ? BatteryChargingIcon : LayersIcon
  return (
    <section
      aria-label="Tu bloque"
      className={cn(
        'bg-card space-y-2 rounded-xl p-4 ring-1',
        block.is_deload ? 'ring-chart-1/60' : 'ring-foreground/10',
      )}
    >
      <p className="flex items-center gap-2">
        <Icon className={cn('size-5', block.is_deload ? 'text-chart-1' : 'text-primary')} aria-hidden />
        <span className="font-heading text-lg font-semibold tabular-nums">
          {block.is_deload ? 'Semana de descarga' : `Semana ${block.week} de ${block.weeks} del bloque`}
        </span>
      </p>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: block.weeks }, (_, index) => {
          const number = index + 1
          const isDeload = number === block.weeks
          return (
            <span
              key={number}
              className={cn(
                'h-2 flex-1 rounded-full',
                number <= block.week
                  ? isDeload
                    ? 'bg-chart-1'
                    : 'bg-primary'
                  : isDeload
                    ? 'bg-chart-1/25'
                    : 'bg-muted',
              )}
            />
          )
        })}
      </div>
      <p className="text-muted-foreground text-xs">
        {block.is_deload ? 'Entrena más suave para recuperar: menos series y RIR 3–4' : blockHint(block)}
      </p>
    </section>
  )
}
