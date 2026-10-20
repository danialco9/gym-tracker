import { PlusIcon } from 'lucide-react'
import { useRef, useState, type Dispatch } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentUser } from '@/features/auth/queries'
import { ApiError } from '@/lib/api'
import { formatTime, plural } from '@/lib/format'
import { useGoalPlans } from '@/features/goal/queries'
import { useProgressOverview } from '@/features/progress/queries'
import {
  completedSetCount,
  draftReducer,
  nextPendingSet,
  toWorkoutPayload,
  type DraftAction,
  type WorkoutDraft,
} from './draft'
import { ExerciseCard } from './ExerciseCard'
import { ExercisePicker } from './ExercisePicker'
import { enqueueWorkout, isTransient } from './outbox'
import { useSaveWorkout } from './queries'
import { RestTimerScreen } from './RestTimerScreen'
import { DEFAULT_REST_SECONDS, useRestTimer } from './useRestTimer'

interface ActiveWorkoutProps {
  draft: WorkoutDraft
  dispatch: Dispatch<DraftAction>
}

export function ActiveWorkout({ draft, dispatch }: ActiveWorkoutProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const timer = useRestTimer()
  const saveWorkout = useSaveWorkout()
  const navigate = useNavigate()
  const currentUser = useCurrentUser().data
  const userId = currentUser?.id
  const goalPlan = useGoalPlans().data?.find((plan) => plan.goal === currentUser?.goal)
  // The goal's shortest rest; "+30 s" is there for the heavy sets that need more.
  const restSeconds = goalPlan?.rest_seconds.min ?? DEFAULT_REST_SECONDS
  const records = new Map(
    useProgressOverview().data?.personal_records.map((record) => [record.exercise_id, record.best_e1rm_kg]),
  )
  const completed = completedSetCount(draft)
  const next = nextPendingSet(draft)

  // Rest only when another set follows: after the very last one, the next step is saving.
  const startRest = (entryId: string, setId: string) => {
    const after = draftReducer(draft, { type: 'toggleDone', entryId, setId })
    if (after !== null && nextPendingSet(after) !== null) {
      timer.start(restSeconds)
    }
  }

  // Finishing an exercise brings the next one into view with its first set already open.
  const scrollToNextExercise = (entryId: string) => {
    const index = draft.exercises.findIndex((entry) => entry.id === entryId)
    const next = draft.exercises[index + 1]
    if (next !== undefined) {
      cardRefs.current.get(next.id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }
  }

  const close = () => {
    timer.stop()
    dispatch({ type: 'discard' })
    navigate('/')
  }

  const finish = () => {
    const payload = toWorkoutPayload(draft, new Date().toISOString())
    saveWorkout.mutate(payload, {
      onSuccess: () => {
        close()
        toast.success('Entreno guardado')
      },
      onError: (error) => {
        // No coverage in the gym: the workout waits on the phone and goes up on its own later.
        if (isTransient(error) && userId !== undefined) {
          enqueueWorkout({ ...payload, client_id: draft.clientId }, userId)
          close()
          toast.info('Sin conexión: el entreno se ha quedado en el móvil y se subirá solo cuando vuelva.')
          return
        }
        toast.error(
          error instanceof ApiError && error.status === 401
            ? 'Tu sesión ha caducado. Entra de nuevo para guardar el entreno: sigue guardado en este dispositivo.'
            : 'No se pudo guardar el entreno. El borrador sigue guardado en este dispositivo.',
        )
      },
    })
  }

  const discard = () => {
    if (window.confirm('¿Descartar este entreno? Se perderán las series apuntadas.')) {
      timer.stop()
      dispatch({ type: 'discard' })
    }
  }

  return (
    // A logging flow reads better in one narrow column, whatever the screen.
    <div className="mx-auto max-w-2xl space-y-4">
      {/* The session bar follows the scroll: the count of completed sets stays in sight. */}
      <header className="bg-background/90 sticky top-0 z-20 -mx-4 flex items-start justify-between gap-2 px-4 py-3 backdrop-blur lg:-mx-2 lg:px-2">
        <div className="min-w-0 space-y-1">
          <p className="eyebrow">En curso · {formatTime(draft.startedAt)}</p>
          <h1 className="font-heading truncate text-xl font-semibold">
            {draft.routineName ?? 'Entreno libre'}
          </h1>
          <p className="text-primary text-sm font-medium tabular-nums">
            {completed} {plural(completed, 'serie', 'series')}{' '}
            {plural(completed, 'completada', 'completadas')}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={discard}>
          Descartar
        </Button>
      </header>

      {draft.exercises.length === 0 && (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
          Añade tu primer ejercicio para empezar.
        </p>
      )}

      {draft.exercises.map((entry) => (
        <div
          key={entry.id}
          // Clears the sticky session bar when an exercise is scrolled to.
          className="scroll-mt-24"
          ref={(node) => {
            if (node === null) {
              cardRefs.current.delete(entry.id)
            } else {
              cardRefs.current.set(entry.id, node)
            }
          }}
        >
          <ExerciseCard
            entry={entry}
            dispatch={dispatch}
            bestE1rmKg={records.get(entry.exerciseId)}
            onSetCompleted={(setId) => startRest(entry.id, setId)}
            onExerciseCompleted={() => scrollToNextExercise(entry.id)}
          />
        </div>
      ))}

      <Button
        variant="outline"
        size="lg"
        className="h-12 w-full text-base"
        onClick={() => setPickerOpen(true)}
      >
        <PlusIcon />
        Añadir ejercicio
      </Button>

      <div className="space-y-2">
        <Label htmlFor="workout-notes">Notas</Label>
        <Textarea
          id="workout-notes"
          value={draft.notes}
          placeholder="Sensaciones, molestias, cambios…"
          onChange={(event) => dispatch({ type: 'setNotes', notes: event.target.value })}
        />
      </div>

      <Button
        size="lg"
        className="h-12 w-full text-base"
        disabled={completed === 0 || saveWorkout.isPending}
        onClick={finish}
      >
        {saveWorkout.isPending ? 'Guardando…' : 'Terminar y guardar'}
      </Button>

      <ExercisePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(exercise) => {
          dispatch({ type: 'addExercise', exercise })
          setPickerOpen(false)
        }}
      />

      {timer.isRunning && next !== null && (
        <RestTimerScreen
          remaining={timer.remaining}
          duration={timer.duration}
          next={{
            exerciseName: next.entry.name,
            number: next.number,
            reps: next.set.reps,
            weightKg: next.set.weightKg,
          }}
          onAdjust={timer.addSeconds}
          onSkip={timer.stop}
        />
      )}
    </div>
  )
}
