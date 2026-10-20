import { PlusIcon, Trash2Icon } from 'lucide-react'
import type { Dispatch } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatSetPlan } from '@/lib/set-plan'
import type { Exercise } from '@/lib/types'
import { ActiveSet } from './ActiveSet'
import type { DraftAction, DraftExercise } from './draft'
import { ExerciseThumbnail } from './ExerciseThumbnail'
import { LastSessionHint } from './LastSessionHint'
import { ProgressRing } from './ProgressRing'
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
}

export function ExerciseCard({
  entry,
  exercise,
  dispatch,
  bestE1rmKg,
  onSetCompleted,
  onExerciseCompleted,
}: ExerciseCardProps) {
  const target = formatSetPlan(entry.targets)
  // The set being logged is the first one not ticked off yet; the rest are summary lines.
  const activeIndex = entry.sets.findIndex((set) => !set.done)
  const doneCount = entry.sets.filter((set) => set.done).length
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
          {exercise && <ExerciseThumbnail exercise={exercise} />}
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
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Quitar ${entry.name}`}
            onClick={() => dispatch({ type: 'removeExercise', entryId: entry.id })}
          >
            <Trash2Icon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1">
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
              onAdjust={(field, delta) =>
                dispatch({ type: 'adjustSet', entryId: entry.id, setId: set.id, field, delta })
              }
              onChange={(changes) =>
                dispatch({ type: 'updateSet', entryId: entry.id, setId: set.id, changes })
              }
              onDone={() => completeSet(set.id, index)}
              onBack={() => previousDone && toggleDone(previousDone.id)}
              onRemove={() => dispatch({ type: 'removeSet', entryId: entry.id, setId: set.id })}
            />
          )
        })}
        <Button
          variant="secondary"
          className="mt-1 h-10 w-full"
          onClick={() => dispatch({ type: 'addSet', entryId: entry.id })}
        >
          <PlusIcon />
          Añadir serie
        </Button>
      </CardContent>
    </Card>
  )
}
