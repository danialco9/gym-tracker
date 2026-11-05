import { CheckCheckIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState, type Dispatch } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatSetPlan } from '@/lib/set-plan'
import type { Exercise } from '@/lib/types'
import { ActiveSet } from './ActiveSet'
import type { DraftAction, DraftExercise } from './draft'
import { exerciseFrameUrls } from './exercise-art'
import { ExerciseThumbnail } from './ExerciseThumbnail'
import { compareWithLastTime } from './last-time'
import { LastSessionHint } from './LastSessionHint'
import { MovementAnimation } from './MovementAnimation'
import { ProgressRing } from './ProgressRing'
import { useLastSession } from './queries'
import { beatsRecord } from './records'
import { CompletedSetRow, PendingSetRow } from './SetSummary'

interface ExerciseCardProps {
  entry: DraftExercise
  /** The catalog exercise, for its drawing; none while the catalog loads. */
  exercise?: Pick<Exercise, 'slug' | 'is_custom'>
  dispatch: Dispatch<DraftAction>
  /** The exercise's saved best estimated 1RM; none when it has no history (or it is loading). */
  bestE1rmKg?: number
  onSetCompleted: (setId: string) => void
  onExerciseCompleted: () => void
  /** Ticks every pending set as it stands, for when the sets were done without logging each one. */
  onCompleteAll: (setIds: string[]) => void
  /** Removes the exercise, or one of its sets; the caller offers the undo. */
  onRemove: () => void
  onRemoveSet: (setId: string) => void
}

export function ExerciseCard({
  entry,
  exercise,
  dispatch,
  bestE1rmKg,
  onSetCompleted,
  onExerciseCompleted,
  onCompleteAll,
  onRemove,
  onRemoveSet,
}: ExerciseCardProps) {
  const target = formatSetPlan(entry.targets)
  // The set being logged is the first one not ticked off yet; the rest are summary lines.
  const activeIndex = entry.sets.findIndex((set) => !set.done)
  const doneCount = entry.sets.filter((set) => set.done).length
  const pendingIds = entry.sets.filter((set) => !set.done).map((set) => set.id)
  const frames = exercise ? exerciseFrameUrls(exercise) : []
  const [showMovement, setShowMovement] = useState(false)
  // The same query as the hint under the title, so it is fetched once.
  const lastSession = useLastSession(entry.exerciseId)
  const toggleDone = (setId: string) => dispatch({ type: 'toggleDone', entryId: entry.id, setId })

  const completeSet = (setId: string, index: number) => {
    toggleDone(setId)
    onSetCompleted(setId)
    // Nothing left to log here: move the workout on to the next exercise.
    if (entry.sets.every((set, position) => set.done || position <= index)) {
      onExerciseCompleted()
    }
  }

  return (
    <Card size="sm" className="[--card-spacing:--spacing(2)] sm:[--card-spacing:--spacing(3)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          {/* The small drawing moves all the time; a tap shows it big, to check the technique mid-workout. */}
          {frames.length > 0 ? (
            <button
              type="button"
              aria-expanded={showMovement}
              aria-label={showMovement ? 'Ocultar cómo se hace' : 'Ver cómo se hace'}
              className="shrink-0 rounded-full"
              onClick={() => setShowMovement((shown) => !shown)}
            >
              <MovementAnimation frames={frames} className="size-12 rounded-full" />
            </button>
          ) : (
            exercise && <ExerciseThumbnail exercise={exercise} />
          )}
          {entry.name}
        </CardTitle>
        <CardDescription className="space-y-0.5">
          {target && <span className="block">Objetivo: {target}</span>}
          <LastSessionHint exerciseId={entry.exerciseId} />
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          {entry.sets.length > 0 && (
            <ProgressRing value={doneCount / entry.sets.length} size={40} strokeWidth={4}>
              <span className="text-xs font-semibold tabular-nums">
                {doneCount}/{entry.sets.length}
                <span className="sr-only"> series hechas</span>
              </span>
            </ProgressRing>
          )}
          <Button variant="ghost" size="icon-sm" aria-label={`Quitar ${entry.name}`} onClick={onRemove}>
            <Trash2Icon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1">
        {showMovement && (
          <MovementAnimation
            frames={frames}
            className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 mx-auto mb-2 aspect-square w-full max-w-56 rounded-2xl"
          />
        )}
        {entry.sets.map((set, index) => {
          const number = index + 1
          if (set.done) {
            return (
              <CompletedSetRow key={set.id} number={number} set={set} onEdit={() => toggleDone(set.id)} />
            )
          }
          if (index !== activeIndex) {
            return <PendingSetRow key={set.id} number={number} set={set} />
          }
          const previousDone = entry.sets.slice(0, index).findLast((earlier) => earlier.done)
          return (
            <ActiveSet
              key={set.id}
              number={number}
              set={set}
              canGoBack={previousDone !== undefined}
              isRecord={beatsRecord(
                set,
                entry.sets.filter((other) => other.done),
                bestE1rmKg,
              )}
              lastTime={compareWithLastTime(entry, index, lastSession.data?.sets)}
              onAdjust={(field, delta) =>
                dispatch({ type: 'adjustSet', entryId: entry.id, setId: set.id, field, delta })
              }
              onChange={(changes) =>
                dispatch({ type: 'updateSet', entryId: entry.id, setId: set.id, changes })
              }
              onDone={() => completeSet(set.id, index)}
              onBack={() => previousDone && toggleDone(previousDone.id)}
              onRemove={() => onRemoveSet(set.id)}
            />
          )
        })}
        <div className="mt-1 flex gap-2">
          <Button
            variant="secondary"
            className="h-10 flex-1"
            onClick={() => dispatch({ type: 'addSet', entryId: entry.id })}
          >
            <PlusIcon />
            Añadir serie
          </Button>
          {/* With a single set left its own button does the same, so this one only shows for two or more. */}
          {pendingIds.length > 1 && (
            <Button variant="outline" className="h-10 flex-1" onClick={() => onCompleteAll(pendingIds)}>
              <CheckCheckIcon />
              Completar todas
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
