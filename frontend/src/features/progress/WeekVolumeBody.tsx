import { useState } from 'react'
import { BodyFigures } from '@/components/body/BodyFigures'
import { formatDecimal } from '@/lib/format'
import { MUSCLE_GROUP_LABELS } from '@/lib/labels'
import type { MuscleGroup, MuscleWeek } from '@/lib/types'
import { WEEK_VOLUME_COLORS, weekVolumeColor, weekVolumeStatus } from './week-volume'

const sets = (count: number) => `${formatDecimal(count)} ${count === 1 ? 'serie' : 'series'}`

/** Where a muscle stands this week, in words. */
function describe(muscle: MuscleWeek): string {
  const name = MUSCLE_GROUP_LABELS[muscle.muscle_group]
  switch (weekVolumeStatus(muscle)) {
    case 'low':
      return `${name}: ${formatDecimal(muscle.hard_sets)} de ${sets(muscle.target_hard_sets)} esta semana. Te faltan ${sets(muscle.target_hard_sets - muscle.hard_sets)}.`
    case 'optimal':
      return `${name}: ${sets(muscle.hard_sets)}. Meta de esta semana cumplida (${muscle.target_hard_sets}).`
    case 'high':
      return `${name}: ${sets(muscle.hard_sets)}, más del máximo (${muscle.max_hard_sets}): sobre todo suman fatiga.`
  }
}

const LEGEND = [
  { color: WEEK_VOLUME_COLORS.empty, label: 'Faltan series' },
  { color: WEEK_VOLUME_COLORS.optimal, label: 'Meta cumplida' },
  { color: WEEK_VOLUME_COLORS.high, label: 'Te pasas' },
]

/**
 * The week's hard sets painted on the body: each main muscle fills with green as it nears the week's
 * target, which climbs through a training block. Smaller muscles stay grey, as the volume advice does
 * not judge them.
 */
export function WeekVolumeBody({ muscles }: { muscles: MuscleWeek[] }) {
  const [selected, setSelected] = useState<MuscleGroup | null>(null)
  const byMuscle = new Map(muscles.map((muscle) => [muscle.muscle_group, muscle]))
  const chosen = selected === null ? undefined : byMuscle.get(selected)

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="font-heading text-lg font-medium">Series de esta semana</h2>
        <p className="text-muted-foreground text-sm">
          Cada músculo se llena de verde al acercarse a la meta de series de esta semana.
        </p>
      </div>
      <BodyFigures
        label={`Series de esta semana. ${muscles.map(describe).join(' ')}`}
        className="mx-auto w-full max-w-72"
        lookOf={({ muscle }) => {
          const week = byMuscle.get(muscle)
          return week === undefined
            ? null
            : {
                color: weekVolumeColor(week),
                dimmed: selected !== null && muscle !== selected,
                selectable: true,
              }
        }}
        onSelect={({ muscle }) => setSelected((current) => (muscle === current ? null : muscle))}
      />
      <ul className="text-muted-foreground flex justify-center gap-4 text-xs">
        {LEGEND.map(({ color, label }) => (
          <li key={label} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
            {label}
          </li>
        ))}
      </ul>
      <p role="status" className="bg-muted min-h-10 rounded-md px-3 py-2 text-center text-sm">
        {chosen ? describe(chosen) : 'Toca un músculo para ver sus series.'}
      </p>
    </section>
  )
}
