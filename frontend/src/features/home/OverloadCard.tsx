import { ArrowDownIcon, CheckIcon, ChevronDownIcon, EqualIcon, TrendingUpIcon } from 'lucide-react'
import { useState } from 'react'
import { formatDecimal, plural } from '@/lib/format'
import type { ExerciseOverload, SetLoad } from '@/lib/types'
import { cn } from '@/lib/utils'

const load = ({ weight_kg, reps }: SetLoad) => `${formatDecimal(weight_kg)} kg × ${reps}`

const VERDICTS = {
  beaten: { icon: CheckIcon, className: 'text-primary' },
  matched: { icon: EqualIcon, className: 'text-muted-foreground' },
  below: { icon: ArrowDownIcon, className: 'text-chart-4' },
} as const

function detail({ verdict, current, previous }: ExerciseOverload): string {
  if (verdict === 'beaten') {
    return `${load(current)} · antes ${load(previous)}`
  }
  if (verdict === 'matched') {
    return `Igual: ${load(current)}`
  }
  return `Toca apretar · última vez ${load(previous)}`
}

/**
 * Progressive overload this week: how many exercises beat their session before, as the workout
 * screen judges each set, with the list a tap away. Nothing to compare yet, no card.
 */
export function OverloadCard({ exercises }: { exercises: ExerciseOverload[] }) {
  const [open, setOpen] = useState(false)
  if (exercises.length === 0) {
    return null
  }
  const beaten = exercises.filter((item) => item.verdict === 'beaten').length

  return (
    <section
      aria-label="Sobrecarga esta semana"
      className="bg-card ring-foreground/10 space-y-3 rounded-xl p-4 ring-1"
    >
      <p className="eyebrow">Sobrecarga · esta semana</p>
      <p className="flex items-center gap-2">
        <TrendingUpIcon
          className={cn('size-5', beaten > 0 ? 'text-primary' : 'text-muted-foreground')}
          aria-hidden
        />
        <span className="font-heading text-lg font-semibold tabular-nums">
          {beaten} de {exercises.length} {plural(exercises.length, 'ejercicio', 'ejercicios')}
        </span>
      </p>
      <p className="text-muted-foreground -mt-2 text-sm">
        {plural(beaten, 'supera', 'superan')} la última vez
      </p>
      <div
        role="progressbar"
        aria-label="Ejercicios que superan la última vez"
        aria-valuemin={0}
        aria-valuemax={exercises.length}
        aria-valuenow={beaten}
        className="bg-muted h-1.5 overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${(beaten / exercises.length) * 100}%` }}
        />
      </div>
      <button
        type="button"
        aria-expanded={open}
        className="text-primary flex items-center gap-1 text-sm font-medium"
        onClick={() => setOpen((shown) => !shown)}
      >
        {open ? 'Ocultar' : 'Ver cuáles'}
        <ChevronDownIcon className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ul className="space-y-2">
          {exercises.map((item) => {
            const { icon: Icon, className } = VERDICTS[item.verdict]
            return (
              <li key={item.exercise_id} className="flex items-start gap-2">
                <Icon className={cn('mt-0.5 size-4 shrink-0', className)} aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.exercise_name}</span>
                  <span className="text-muted-foreground block text-xs tabular-nums">{detail(item)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
