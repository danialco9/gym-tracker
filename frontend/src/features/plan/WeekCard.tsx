import { CalendarCogIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlayIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { QueryStatus } from '@/components/QueryStatus'
import { Button, buttonVariants } from '@/components/ui/button'
import { plural } from '@/lib/format'
import type { PlanDay, WeekPlan } from '@/lib/types'
import { cn } from '@/lib/utils'
import { DaySheet } from './DaySheet'
import { describeDay } from './describe-day'
import { useWeekPlan } from './queries'
import { addDays, dayOfMonth, formatLongDay, formatWeekRange, WEEKDAY_LETTERS, weekdayOf } from './week-dates'

/** The day in a few letters, for a column a seventh of a phone wide. */
function shortLabel(day: PlanDay): string {
  if (day.kind === 'free') {
    return 'Libre'
  }
  // A dash reads as rest without the word, which never fits.
  return day.routine?.name ?? '—'
}

function DayCell({ day, isToday, onOpen }: { day: PlanDay; isToday: boolean; onOpen: () => void }) {
  const weekday = WEEKDAY_LETTERS[weekdayOf(day.on_date)]
  const label = [
    formatLongDay(day.on_date),
    describeDay(day),
    day.changed && 'cambiado solo este día',
    day.trained && 'entrenado',
    isToday && 'hoy',
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <li className="min-w-0">
      <button
        type="button"
        aria-label={label}
        onClick={onOpen}
        className={cn(
          'flex h-full w-full flex-col items-center gap-1 rounded-lg px-0.5 py-2 transition-colors',
          isToday ? 'bg-primary/15 ring-primary ring-2' : 'hover:bg-accent',
        )}
      >
        <span className="text-muted-foreground text-[0.65rem] font-medium">{weekday}</span>
        <span className="relative grid size-7 place-items-center">
          {day.trained ? (
            <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-full">
              <CheckIcon className="size-4" aria-hidden />
            </span>
          ) : (
            <span className={cn('font-heading text-sm tabular-nums', isToday && 'font-semibold')}>
              {dayOfMonth(day.on_date)}
            </span>
          )}
          {/* A dot marks a date changed from the usual week. */}
          {day.changed && (
            <span className="bg-chart-4 absolute -top-0.5 -right-0.5 size-2 rounded-full" aria-hidden />
          )}
        </span>
        <span
          className={cn(
            'w-full truncate text-center text-[0.65rem] leading-tight',
            day.kind === 'rest' ? 'text-muted-foreground/70' : 'font-medium',
          )}
        >
          {shortLabel(day)}
        </span>
      </button>
    </li>
  )
}

/** What today holds, with the way into the workout. */
function Today({ day }: { day: PlanDay }) {
  if (day.trained) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <CheckIcon className="text-primary size-4" aria-hidden />
        Hoy ya has entrenado. ¡Bien hecho!
      </p>
    )
  }
  if (day.kind === 'rest') {
    return <p className="text-muted-foreground text-sm">Hoy descansas: recuperar también es entrenar.</p>
  }
  const routine = day.kind === 'routine' ? day.routine : null
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="min-w-0 text-sm">
        <span className="text-muted-foreground">Hoy toca </span>
        <span className="font-medium">{routine?.name ?? 'entreno libre'}</span>
        {routine && (
          <span className="text-muted-foreground">
            {' '}
            · {routine.exercise_count} {plural(routine.exercise_count, 'ejercicio', 'ejercicios')}
          </span>
        )}
      </p>
      <Link
        to={routine ? `/entrenar?rutina=${routine.id}` : '/entrenar'}
        className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}
      >
        <PlayIcon />
        Empezar
      </Link>
    </div>
  )
}

function Week({ week, onOpen }: { week: WeekPlan; onOpen: (day: PlanDay) => void }) {
  const today = week.days.find((day) => day.on_date === week.today)
  const empty = week.days.every((day) => day.kind === 'rest' && !day.changed)
  return (
    <>
      <ol className="grid grid-cols-7 gap-1">
        {week.days.map((day) => (
          <DayCell
            key={day.on_date}
            day={day}
            isToday={day.on_date === week.today}
            onOpen={() => onOpen(day)}
          />
        ))}
      </ol>
      {empty ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Elige qué días entrenas y te preparo las rutinas, o toca un día para asignarlo tú.
          </p>
          <Link to="/semana" className={cn(buttonVariants({ size: 'lg' }), 'h-11 w-full text-base')}>
            <CalendarCogIcon />
            Planificar mi semana
          </Link>
        </div>
      ) : (
        today && <Today day={today} />
      )}
    </>
  )
}

/**
 * The week from Monday to Sunday: what each day holds, which were trained, and today's workout.
 * Tapping a day changes it, only that date or every week.
 */
export function WeekCard() {
  // Any day of the week shown; null is the current week.
  const [start, setStart] = useState<string | null>(null)
  const [open, setOpen] = useState<PlanDay | null>(null)
  const week = useWeekPlan(start)
  const shown = week.data
  const isCurrent = shown !== undefined && shown.days.some((day) => day.on_date === shown.today)
  // The sheet follows the refetched week, so it shows a change as soon as it is saved.
  const openDay = open && shown?.days.find((day) => day.on_date === open.on_date)

  return (
    <section aria-label="Tu semana" className="bg-card ring-foreground/10 space-y-3 rounded-xl p-4 ring-1">
      <div className="flex items-center justify-between gap-2">
        <h2 className="eyebrow">
          {shown === undefined || isCurrent ? 'Esta semana' : `Semana ${formatWeekRange(shown.start)}`}
        </h2>
        {shown && (
          <div className="flex items-center gap-1">
            {!isCurrent && (
              <Button variant="ghost" size="sm" onClick={() => setStart(null)}>
                Hoy
              </Button>
            )}
            <Link
              to="/semana"
              aria-label="Planificar la semana"
              className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            >
              <CalendarCogIcon />
            </Link>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Semana anterior"
              onClick={() => setStart(addDays(shown.start, -7))}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Semana siguiente"
              onClick={() => setStart(addDays(shown.start, 7))}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        )}
      </div>
      <QueryStatus query={week} loading="Cargando tu semana…" error="No se pudo cargar tu semana." />
      {shown && <Week week={shown} onOpen={setOpen} />}
      {shown && <DaySheet day={openDay ?? null} week={shown} onClose={() => setOpen(null)} />}
    </section>
  )
}
