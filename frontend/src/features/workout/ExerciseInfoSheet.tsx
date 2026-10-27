import { DumbbellIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS } from '@/lib/labels'
import type { Exercise } from '@/lib/types'
import { exerciseFrameUrls } from './exercise-art'
import { MovementAnimation } from './MovementAnimation'

interface ExerciseInfoSheetProps {
  /** The exercise to show; null keeps the sheet closed. */
  exercise: Exercise | null
  onClose: () => void
  onAdd: (exercise: Exercise) => void
}

export function ExerciseInfoSheet({ exercise, onClose, onAdd }: ExerciseInfoSheetProps) {
  return (
    <Sheet open={exercise !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] max-w-2xl gap-0 overflow-y-auto rounded-t-xl"
      >
        {exercise && <ExerciseInfo exercise={exercise} onAdd={onAdd} />}
      </SheetContent>
    </Sheet>
  )
}

function ExerciseInfo({ exercise, onAdd }: { exercise: Exercise; onAdd: (exercise: Exercise) => void }) {
  const frames = exerciseFrameUrls(exercise)
  const secondary = exercise.secondary_muscles.map((muscle) => MUSCLE_GROUP_LABELS[muscle]).join(', ')

  return (
    <div className="space-y-5 p-4 pt-12 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {frames.length > 0 ? (
        <MovementAnimation frames={frames} className="mx-auto aspect-square w-full max-w-64 rounded-2xl" />
      ) : (
        <div className="bg-muted mx-auto flex aspect-square w-full max-w-64 items-center justify-center rounded-2xl">
          <DumbbellIcon className="text-muted-foreground size-12" aria-hidden="true" />
        </div>
      )}

      <div className="space-y-1">
        <SheetTitle className="text-xl font-semibold">{exercise.name}</SheetTitle>
        <SheetDescription>
          {frames.length > 0
            ? 'El dibujo muestra el movimiento completo.'
            : 'Este ejercicio no tiene dibujo.'}
        </SheetDescription>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Músculo principal</dt>
        <dd className="font-medium">{MUSCLE_GROUP_LABELS[exercise.muscle_group]}</dd>
        {secondary && (
          <>
            <dt className="text-muted-foreground">Secundarios</dt>
            <dd>{secondary}</dd>
          </>
        )}
        {exercise.equipment && (
          <>
            <dt className="text-muted-foreground">Material</dt>
            <dd>{EQUIPMENT_LABELS[exercise.equipment]}</dd>
          </>
        )}
      </dl>

      <Button size="lg" className="h-12 w-full text-base" onClick={() => onAdd(exercise)}>
        Añadir
      </Button>
    </div>
  )
}
