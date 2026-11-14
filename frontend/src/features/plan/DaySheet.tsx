import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { OptionChip } from '@/features/workout/OptionChip'
import { useRoutines } from '@/features/workout/queries'
import type { PlanDay, WeekPlan } from '@/lib/types'
import {
  type DayChoice,
  useChangeDay,
  useMoveDay,
  useSetUsualDay,
  useUndoChange,
  useUsualWeek,
} from './queries'
import { dayOfMonth, formatLongDay, WEEKDAY_LETTERS, WEEKDAY_NAMES, weekdayOf } from './week-dates'
import { describeDay } from './describe-day'

type Scope = 'date' | 'weekday'

const sameChoice = (a: DayChoice, b: DayChoice) => a.kind === b.kind && a.routineId === b.routineId

function DayForm({ day, week, onDone }: { day: PlanDay; week: WeekPlan; onDone: () => void }) {
  const routines = useRoutines()
  const usualWeek = useUsualWeek()
  const changeDay = useChangeDay()
  const undoChange = useUndoChange()
  const moveDay = useMoveDay()
  const setUsualDay = useSetUsualDay()
  const current: DayChoice = { kind: day.kind, routineId: day.routine?.id ?? null }
  const [choice, setChoice] = useState<DayChoice>(current)
  const [scope, setScope] = useState<Scope>('date')
  const [failed, setFailed] = useState(false)
  const weekday = weekdayOf(day.on_date)
  const busy = changeDay.isPending || undoChange.isPending || moveDay.isPending || setUsualDay.isPending

  const run = async (action: () => Promise<unknown>) => {
    setFailed(false)
    try {
      await action()
      onDone()
    } catch {
      setFailed(true)
    }
  }

  const save = () =>
    run(async () => {
      if (scope === 'date') {
        await changeDay.mutateAsync({ date: day.on_date, choice })
        return
      }
      await setUsualDay.mutateAsync({ usualWeek: usualWeek.data ?? [], weekday, choice })
      // Every week from now on, this one included.
      if (day.changed) {
        await undoChange.mutateAsync(day.on_date)
      }
    })

  const options: { label: string; choice: DayChoice }[] = [
    ...(routines.data ?? []).map((routine) => ({
      label: routine.name,
      choice: { kind: 'routine' as const, routineId: routine.id },
    })),
    { label: 'Entreno libre', choice: { kind: 'free', routineId: null } },
    { label: 'Descanso', choice: { kind: 'rest', routineId: null } },
  ]
  const others = week.days.filter((other) => other.on_date !== day.on_date)
  const unchanged = scope === 'date' && sameChoice(choice, current)

  return (
    <div className="space-y-5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="space-y-1 pr-8">
        <SheetTitle className="text-xl font-semibold">{formatLongDay(day.on_date)}</SheetTitle>
        <SheetDescription>
          {describeDay(day)}
          {day.changed && ' · cambiado solo este día'}
          {day.trained && ' · entrenado'}
        </SheetDescription>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">¿Qué toca?</h3>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <OptionChip
              key={option.label}
              label={option.label}
              pressed={sameChoice(option.choice, choice)}
              onClick={() => setChoice(option.choice)}
            />
          ))}
        </div>
        {routines.data?.length === 0 && (
          <p className="text-muted-foreground text-xs">
            Crea rutinas en la pestaña Rutinas para asignarlas aquí.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">¿Para cuándo?</h3>
        <div className="flex flex-wrap gap-2">
          <OptionChip label="Solo este día" pressed={scope === 'date'} onClick={() => setScope('date')} />
          <OptionChip
            label={`Todos los ${WEEKDAY_NAMES[weekday]}`}
            pressed={scope === 'weekday'}
            onClick={() => setScope('weekday')}
          />
        </div>
      </section>

      {failed && (
        <Alert variant="destructive">
          <AlertDescription>No se pudo guardar. Revisa la conexión e inténtalo de nuevo.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" className="h-11 sm:flex-1" disabled={busy || unchanged} onClick={() => void save()}>
          Guardar
        </Button>
        {day.changed && (
          <Button
            size="lg"
            variant="outline"
            className="h-11 sm:flex-1"
            disabled={busy}
            onClick={() => void run(() => undoChange.mutateAsync(day.on_date))}
          >
            Volver a lo de siempre
          </Button>
        )}
      </div>

      {day.kind !== 'rest' && (
        <section className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-medium">¿No puedes este día? Muévelo a otro</h3>
          <p className="text-muted-foreground text-xs">
            Pasa {day.kind === 'free' ? 'el entreno libre' : day.routine?.name} al día que elijas, y este
            queda de descanso.
          </p>
          <div className="grid grid-cols-6 gap-1.5">
            {others.map((other) => (
              <Button
                key={other.on_date}
                variant="outline"
                className="h-auto flex-col gap-0 py-1.5"
                disabled={busy}
                aria-label={`Mover al ${formatLongDay(other.on_date).toLowerCase()}`}
                onClick={() => void run(() => moveDay.mutateAsync({ from: day.on_date, to: other.on_date }))}
              >
                <span className="text-muted-foreground text-[0.65rem]">
                  {WEEKDAY_LETTERS[weekdayOf(other.on_date)]}
                </span>
                <span className="tabular-nums">{dayOfMonth(other.on_date)}</span>
              </Button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** Changes one day of the week: what it holds, only that date or every week, or moves it. */
export function DaySheet({
  day,
  week,
  onClose,
}: {
  day: PlanDay | null
  week: WeekPlan
  onClose: () => void
}) {
  return (
    <Sheet open={day !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] max-w-2xl gap-0 overflow-y-auto overscroll-contain rounded-t-xl"
      >
        {/* Keyed by date, so another day starts from what it holds. */}
        {day && <DayForm key={day.on_date} day={day} week={week} onDone={onClose} />}
      </SheetContent>
    </Sheet>
  )
}
