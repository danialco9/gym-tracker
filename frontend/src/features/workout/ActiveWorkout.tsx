import { PlusIcon } from 'lucide-react'
import { useRef, useState, type Dispatch } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentUser } from '@/features/auth/queries'
import { ApiError } from '@/lib/api'
import { formatDecimal, formatTime, plural } from '@/lib/format'
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
import { ExerciseCarousel, type ExerciseCarouselHandle } from './ExerciseCarousel'
import { ExercisePicker } from './ExercisePicker'
import { enqueueWorkout, isTransient } from './outbox'
import { useExercises, useSaveWorkout } from './queries'
import { useRestNotification, useRestPushSetting } from './rest-push'
import { RestTimerScreen } from './RestTimerScreen'
import { DEFAULT_REST_SECONDS, useRestTimer } from './useRestTimer'

interface ActiveWorkoutProps {
  draft: WorkoutDraft
  dispatch: Dispatch<DraftAction>
}

export function ActiveWorkout({ draft, dispatch }: ActiveWorkoutProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const carousel = useRef<ExerciseCarouselHandle>(null)
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
  const catalog = new Map(useExercises().data?.map((exercise) => [exercise.id, exercise]))
  const completed = completedSetCount(draft)
  const total = draft.exercises.reduce((sum, entry) => sum + entry.sets.length, 0)
  // The exercise of the last set ticked off: the rest announces what follows it, not the routine's first.
  const [currentEntryId, setCurrentEntryId] = useState<string>()
  const next = nextPendingSet(draft, currentEntryId)
  const restPush = useRestPushSetting()
  useRestNotification(
    timer.endsAt,
    next &&
      `${next.entry.name} · serie ${next.number} · ${next.set.reps} × ${formatDecimal(next.set.weightKg)} kg`,
    restPush.status,
  )

  // Rest only when another set follows: after the very last one, the next step is saving.
  const startRest = (entryId: string, setId: string) => {
    setCurrentEntryId(entryId)
    const after = draftReducer(draft, { type: 'toggleDone', entryId, setId })
    if (after !== null && nextPendingSet(after) !== null) {
      timer.start(restSeconds)
    }
  }

  // Finishing an exercise slides the next one in with its first set already open.
  const showNextExercise = (entryId: string) => {
    const index = draft.exercises.findIndex((entry) => entry.id === entryId)
    if (index + 1 < draft.exercises.length) {
      carousel.current?.show(index + 1)
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
        {total > 0 && (
          <div
            role="progressbar"
            aria-label="Progreso del entreno"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={completed}
            className="bg-muted absolute inset-x-4 bottom-0 h-1 overflow-hidden rounded-full lg:inset-x-2"
          >
            <div
              className="bg-primary h-full rounded-full transition-[width] duration-300"
              style={{ width: `${(completed / total) * 100}%` }}
            />
          </div>
        )}
      </header>

      {draft.exercises.length === 0 && (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
          Añade tu primer ejercicio para empezar.
        </p>
      )}

      {draft.exercises.length > 0 && (
        <ExerciseCarousel ref={carousel} exercises={draft.exercises}>
          {(entry) => (
            <ExerciseCard
              entry={entry}
              exercise={catalog.get(entry.exerciseId)}
              dispatch={dispatch}
              bestE1rmKg={records.get(entry.exerciseId)}
              onSetCompleted={(setId) => startRest(entry.id, setId)}
              onExerciseCompleted={() => showNextExercise(entry.id)}
            />
          )}
        </ExerciseCarousel>
      )}

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
          // Once its slide is rendered, bring the new exercise into view.
          const index = draft.exercises.length
          requestAnimationFrame(() => carousel.current?.show(index))
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
          notification={restPush.status}
          onEnableNotification={() => {
            restPush.enable().catch(() => toast.error('No se pudieron activar los avisos. Prueba otra vez.'))
          }}
        />
      )}
    </div>
  )
}
