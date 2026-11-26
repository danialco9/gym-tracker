import { ChevronLeftIcon, ChevronRightIcon, PencilIcon } from 'lucide-react'
import { useState } from 'react'
import { QueryStatus } from '@/components/QueryStatus'
import { Button } from '@/components/ui/button'
import { dayOfMonth, formatLongDay, WEEKDAY_LETTERS, weekdayOf } from '@/features/plan/week-dates'
import { useMonthWorkouts, useRoutines } from '@/features/workout/queries'
import { workoutSummary } from '@/features/workout/workout-summary'
import { plural } from '@/lib/format'
import type { Workout } from '@/lib/types'
import { cn } from '@/lib/utils'
import { addMonths, daysOf, formatMonth, heatLevel, localDate, monthOf } from './calendar'
import { EditWorkoutSheet } from './EditWorkoutSheet'

const HEAT_CLASSES = [
  '',
  'bg-primary/20',
  'bg-primary/40',
  'bg-primary/70',
  'bg-primary text-primary-foreground',
] as const

const workingSets = (workouts: readonly Workout[]) =>
  workouts.reduce((sum, workout) => sum + workout.sets.filter((set) => !set.is_warmup).length, 0)

const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })

/**
 * A month of workouts: each day trained shaded by how many working sets it had, and the workouts of
 * the day tapped listed below.
 */
export function CalendarTab() {
  const [today] = useState(() => localDate(new Date()))
  const [month, setMonth] = useState(() => monthOf(today))
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<Workout | null>(null)
  const workouts = useMonthWorkouts(month, addMonths(month, 1))
  const routineNames = new Map(useRoutines().data?.map((routine) => [routine.id, routine.name]))

  const byDay = new Map<string, Workout[]>()
  for (const workout of workouts.data ?? []) {
    const day = localDate(workout.started_at)
    byDay.set(day, [...(byDay.get(day) ?? []), workout])
  }
  const days = daysOf(month)
  const trainedDays = days.filter((day) => byDay.has(day)).length
  const chosen =
    selected === null
      ? []
      : (byDay.get(selected) ?? []).toSorted((a, b) => a.started_at.localeCompare(b.started_at))

  const goTo = (months: number) => {
    setMonth(addMonths(month, months))
    setSelected(null)
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" aria-label="Mes anterior" onClick={() => goTo(-1)}>
          <ChevronLeftIcon />
        </Button>
        <div className="text-center">
          <h2 className="font-heading text-lg font-medium">{formatMonth(month)}</h2>
          <p className="text-muted-foreground text-xs">
            {trainedDays} {plural(trainedDays, 'día entrenado', 'días entrenados')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Mes siguiente"
          disabled={month >= monthOf(today)}
          onClick={() => goTo(1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>

      <QueryStatus query={workouts} loading="Cargando el mes…" error="No se pudo cargar el mes." />

      <div className="grid grid-cols-7 gap-1 text-center" role="group" aria-label={formatMonth(month)}>
        {WEEKDAY_LETTERS.map((letter) => (
          <span key={letter} className="text-muted-foreground text-[0.65rem] font-medium" aria-hidden>
            {letter}
          </span>
        ))}
        {/* Empty cells up to the month's first weekday, Monday first. */}
        {Array.from({ length: weekdayOf(days[0]!) }, (_, index) => (
          <span key={`blank-${index}`} aria-hidden />
        ))}
        {days.map((day) => {
          const dayWorkouts = byDay.get(day) ?? []
          const sets = workingSets(dayWorkouts)
          const level = heatLevel(dayWorkouts.length > 0 ? Math.max(sets, 1) : 0)
          const label =
            dayWorkouts.length === 0
              ? `${formatLongDay(day)}, sin entrenos`
              : `${formatLongDay(day)}, ${dayWorkouts.length} ${plural(dayWorkouts.length, 'entreno', 'entrenos')}, ${sets} ${plural(sets, 'serie', 'series')}`
          return (
            <button
              key={day}
              type="button"
              aria-label={label}
              aria-pressed={selected === day}
              disabled={dayWorkouts.length === 0}
              onClick={() => setSelected(selected === day ? null : day)}
              className={cn(
                'grid aspect-square place-items-center rounded-md text-sm tabular-nums transition-colors',
                HEAT_CLASSES[level],
                dayWorkouts.length === 0 && 'text-muted-foreground',
                day === today && 'ring-primary ring-2',
                selected === day && 'ring-foreground ring-2',
              )}
            >
              {dayOfMonth(day)}
            </button>
          )
        })}
      </div>

      <div className="text-muted-foreground flex items-center justify-end gap-1 text-xs" aria-hidden>
        Menos
        {HEAT_CLASSES.slice(1).map((shade) => (
          <span key={shade} className={cn('size-3 rounded-sm', shade)} />
        ))}
        Más series
      </div>

      {selected !== null && (
        <section aria-label={formatLongDay(selected)} className="space-y-2">
          <h3 className="font-medium">{formatLongDay(selected)}</h3>
          <ul className="bg-card ring-foreground/10 divide-border divide-y rounded-xl ring-1">
            {chosen.map((workout) => (
              <li key={workout.id} className="flex items-center gap-3 py-3 pr-2 pl-4">
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">
                      {workout.routine_id === null
                        ? 'Entreno libre'
                        : (routineNames.get(workout.routine_id) ?? 'Rutina')}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
                      {time.format(new Date(workout.started_at))}
                    </span>
                  </span>
                  <span className="text-muted-foreground block text-sm">{workoutSummary(workout)}</span>
                </span>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-10 shrink-0"
                  onClick={() => setEditing(workout)}
                >
                  <PencilIcon />
                  Editar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <EditWorkoutSheet workout={editing} onClose={() => setEditing(null)} />
    </section>
  )
}
