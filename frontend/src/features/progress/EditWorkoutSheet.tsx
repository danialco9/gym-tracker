import { Trash2Icon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { formatLongDay } from '@/features/plan/week-dates'
import { useDeleteWorkout, useExercises, useUpdateWorkout } from '@/features/workout/queries'
import { formatDecimal } from '@/lib/format'
import { RIR_OPTIONS } from '@/lib/rir'
import type { Workout } from '@/lib/types'
import { cn } from '@/lib/utils'
import { localDate } from './calendar'
import { isValidReps, isValidWeight, toEditableSets, toEditedPayload, type EditableSet } from './edit-workout'

const FIELD_CLASS = 'h-10 px-1 text-center text-base tabular-nums'
const SELECT_CLASS =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-1 text-center text-base outline-none focus-visible:ring-3'
const ROW_GRID = 'grid grid-cols-[1.75rem_1fr_3.75rem_4.25rem_2.5rem] items-center gap-1.5'

interface EditWorkoutSheetProps {
  /** The workout to edit; null keeps the sheet closed. */
  workout: Workout | null
  onClose: () => void
}

/** Fixes a saved workout from the calendar: each set's kg, reps and RIR, removing sets, and the notes. */
export function EditWorkoutSheet({ workout, onClose }: EditWorkoutSheetProps) {
  const dirty = useRef(false)
  const close = () => {
    if (!dirty.current || window.confirm('¿Salir sin guardar? Perderás los cambios de este entreno.')) {
      dirty.current = false
      onClose()
    }
  }

  return (
    <Sheet open={workout !== null} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] max-w-2xl gap-0 overflow-y-auto overscroll-contain rounded-t-xl pb-[env(safe-area-inset-bottom)]"
      >
        {workout && (
          <EditBody
            key={workout.id}
            workout={workout}
            onDirtyChange={(value) => {
              dirty.current = value
            }}
            onDone={() => {
              dirty.current = false
              onClose()
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function EditBody({
  workout,
  onDirtyChange,
  onDone,
}: {
  workout: Workout
  onDirtyChange: (dirty: boolean) => void
  onDone: () => void
}) {
  const notesId = useId()
  const [initial] = useState(() => toEditableSets(workout))
  const [sets, setSets] = useState(initial)
  const [notes, setNotes] = useState(workout.notes ?? '')
  const names = new Map(useExercises().data?.map((exercise) => [exercise.id, exercise.name]))
  const updateWorkout = useUpdateWorkout()
  const deleteWorkout = useDeleteWorkout()

  const dirty = sets !== initial || notes !== (workout.notes ?? '')
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  const invalid = sets.some((set) => !isValidWeight(set.weight) || !isValidReps(set.reps))
  const busy = updateWorkout.isPending || deleteWorkout.isPending

  const change = (key: number, patch: Partial<EditableSet>) =>
    setSets((current) => current.map((set) => (set.key === key ? { ...set, ...patch } : set)))
  const remove = (key: number) => setSets((current) => current.filter((set) => set.key !== key))

  const save = async () => {
    try {
      await updateWorkout.mutateAsync({ id: workout.id, payload: toEditedPayload(workout, sets, notes) })
      toast.success('Entreno guardado')
      onDone()
    } catch {
      toast.error('No se pudo guardar el entreno.')
    }
  }

  const removeWorkout = async () => {
    if (!window.confirm('¿Borrar este entreno entero? No se puede deshacer.')) {
      return
    }
    try {
      await deleteWorkout.mutateAsync(workout.id)
      toast.success('Entreno borrado')
      onDone()
    } catch {
      toast.error('No se pudo borrar el entreno.')
    }
  }

  // Sets grouped by exercise, in the order they were done.
  const groups: { exerciseId: number; sets: EditableSet[] }[] = []
  for (const set of sets) {
    const group = groups.at(-1)
    if (group?.exerciseId === set.exercise_id) {
      group.sets.push(set)
    } else {
      groups.push({ exerciseId: set.exercise_id, sets: [set] })
    }
  }

  return (
    <>
      <SheetHeader className="pb-2">
        <SheetTitle>Editar entreno</SheetTitle>
        <SheetDescription>{formatLongDay(localDate(workout.started_at))}</SheetDescription>
      </SheetHeader>

      <div className="space-y-5 px-4">
        {groups.length === 0 && (
          <p className="text-muted-foreground text-sm">No quedan series. Guarda así o borra el entreno.</p>
        )}
        {groups.map((group) => {
          const name = names.get(group.exerciseId) ?? 'Ejercicio'
          return (
            <section key={group.sets[0]!.key} aria-label={name} className="space-y-1.5">
              <h3 className="font-medium">{name}</h3>
              <div className={cn(ROW_GRID, 'text-muted-foreground text-xs')} aria-hidden>
                <span />
                <span className="text-center">kg</span>
                <span className="text-center">Reps</span>
                <span className="text-center">RIR</span>
                <span />
              </div>
              {group.sets.map((set, index) => {
                const working = group.sets.slice(0, index + 1).filter((item) => !item.is_warmup).length
                const number = set.is_warmup ? 'C' : String(working)
                const label = `${name}, ${set.is_warmup ? 'calentamiento' : `serie ${number}`}`
                return (
                  <div key={set.key} className={ROW_GRID}>
                    <span className="text-muted-foreground text-center text-sm font-medium tabular-nums">
                      {number}
                    </span>
                    <Input
                      inputMode="decimal"
                      aria-label={`${label}: kg`}
                      aria-invalid={!isValidWeight(set.weight)}
                      className={FIELD_CLASS}
                      value={set.weight}
                      onChange={(event) => change(set.key, { weight: event.target.value })}
                    />
                    <Input
                      inputMode="numeric"
                      aria-label={`${label}: reps`}
                      aria-invalid={!isValidReps(set.reps)}
                      className={FIELD_CLASS}
                      value={set.reps}
                      onChange={(event) => change(set.key, { reps: event.target.value })}
                    />
                    <RirSelect
                      label={`${label}: RIR`}
                      rpe={set.rpe}
                      onChange={(rpe) => change(set.key, { rpe })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-10"
                      aria-label={`Quitar ${label}`}
                      onClick={() => remove(set.key)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                )
              })}
            </section>
          )
        })}

        <div className="space-y-2">
          <Label htmlFor={notesId}>Notas</Label>
          <Textarea
            id={notesId}
            value={notes}
            maxLength={2000}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        {invalid && (
          <p role="alert" className="text-destructive text-sm">
            Revisa los kg (0 a 1000) y las reps (número entero).
          </p>
        )}
      </div>

      <div className="space-y-2 p-4">
        <Button
          size="lg"
          className="h-12 w-full text-base"
          disabled={!dirty || invalid || busy}
          onClick={save}
        >
          {updateWorkout.isPending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="text-destructive h-12 w-full text-base"
          disabled={busy}
          onClick={removeWorkout}
        >
          <Trash2Icon />
          {deleteWorkout.isPending ? 'Borrando…' : 'Borrar entreno'}
        </Button>
      </div>
    </>
  )
}

/** RIR as the workout asks it, stored as RPE. A half point from dictation stays as its own option. */
function RirSelect({
  label,
  rpe,
  onChange,
}: {
  label: string
  rpe: number | null
  onChange: (rpe: number | null) => void
}) {
  const options: { label: string; rpe: number }[] = [...RIR_OPTIONS]
  if (rpe !== null && !options.some((option) => option.rpe === rpe)) {
    options.push({ label: formatDecimal(10 - rpe), rpe })
    options.sort((a, b) => b.rpe - a.rpe)
  }
  return (
    <select
      aria-label={label}
      className={SELECT_CLASS}
      value={rpe === null ? '' : String(rpe)}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
    >
      <option value="">—</option>
      {options.map((option) => (
        <option key={option.rpe} value={option.rpe}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
