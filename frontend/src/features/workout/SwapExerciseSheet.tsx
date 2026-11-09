import { SearchIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { MUSCLE_GROUP_LABELS } from '@/lib/labels'
import type { Exercise } from '@/lib/types'
import { alternativesFor } from './exercise-search'
import { ExerciseInfoSheet } from './ExerciseInfoSheet'
import { ExerciseSection } from './ExercisePicker'
import { useExercises } from './queries'

interface SwapExerciseSheetProps {
  /** The exercise to swap; null keeps the sheet closed. */
  exercise: Exercise | null
  /** Exercises the workout already has, left out of the alternatives. */
  exclude: ReadonlySet<number>
  onSelect: (exercise: Exercise) => void
  /** None of the alternatives will do: look through the whole catalog instead. */
  onSearch: () => void
  onClose: () => void
}

/** When the machine is taken: a few exercises for the same muscle, the closest movement first. */
export function SwapExerciseSheet({
  exercise,
  exclude,
  onSelect,
  onSearch,
  onClose,
}: SwapExerciseSheetProps) {
  return (
    <Sheet open={exercise !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85dvh] max-w-2xl gap-0 overflow-y-auto overscroll-contain rounded-t-xl pb-[env(safe-area-inset-bottom)]"
      >
        {exercise && (
          <SwapBody exercise={exercise} exclude={exclude} onSelect={onSelect} onSearch={onSearch} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function SwapBody({
  exercise,
  exclude,
  onSelect,
  onSearch,
}: Omit<SwapExerciseSheetProps, 'onClose'> & { exercise: Exercise }) {
  const [info, setInfo] = useState<Exercise | null>(null)
  const alternatives = alternativesFor(exercise, useExercises().data ?? [], exclude)

  return (
    <>
      <SheetHeader className="pb-0">
        <SheetTitle>Cambiar {exercise.name} por…</SheetTitle>
        <SheetDescription>Del mismo músculo, los más parecidos primero.</SheetDescription>
      </SheetHeader>

      {alternatives.length > 0 ? (
        <ExerciseSection
          title={MUSCLE_GROUP_LABELS[exercise.muscle_group]}
          exercises={alternatives}
          onSelect={onSelect}
          onInfo={setInfo}
        />
      ) : (
        <p className="text-muted-foreground px-4 pt-4 text-sm">No hay otros ejercicios de este músculo.</p>
      )}

      <div className="p-4">
        <Button variant="outline" size="lg" className="h-12 w-full text-base" onClick={onSearch}>
          <SearchIcon />
          Buscar otro ejercicio
        </Button>
      </div>

      <ExerciseInfoSheet
        exercise={info}
        addLabel="Cambiar por este"
        onClose={() => setInfo(null)}
        onAdd={(chosen) => {
          setInfo(null)
          onSelect(chosen)
        }}
      />
    </>
  )
}
