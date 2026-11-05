import { type FormEvent, useId, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { ApiError } from '@/lib/api'
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS } from '@/lib/labels'
import type { Equipment, Exercise, MuscleGroup } from '@/lib/types'
import { OptionChip } from './OptionChip'
import { useCreateExercise } from './queries'

const MAX_NAME_LENGTH = 100
const MUSCLE_OPTIONS = Object.entries(MUSCLE_GROUP_LABELS) as [MuscleGroup, string][]
const EQUIPMENT_OPTIONS = Object.entries(EQUIPMENT_LABELS) as [Equipment, string][]

interface CreateExerciseSheetProps {
  open: boolean
  /** Prefills the name, usually with what the person searched for and did not find. */
  initialName: string
  onOpenChange: (open: boolean) => void
  onCreated: (exercise: Exercise) => void
}

export function CreateExerciseSheet({
  open,
  initialName,
  onOpenChange,
  onCreated,
}: CreateExerciseSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] max-w-2xl gap-0 overflow-y-auto overscroll-contain rounded-t-xl"
      >
        {/* Mounted only while open, so the form starts from the latest search each time. */}
        {open && <CreateExerciseForm initialName={initialName} onCreated={onCreated} />}
      </SheetContent>
    </Sheet>
  )
}

function CreateExerciseForm({
  initialName,
  onCreated,
}: Pick<CreateExerciseSheetProps, 'initialName' | 'onCreated'>) {
  const createExercise = useCreateExercise()
  const [name, setName] = useState(initialName.trim())
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null)
  const [equipment, setEquipment] = useState<Equipment | null>(null)
  const nameId = useId()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (muscle === null) {
      return
    }
    createExercise.mutate({ name: name.trim(), muscle_group: muscle, equipment }, { onSuccess: onCreated })
  }

  return (
    <form onSubmit={submit} className="space-y-5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="space-y-1 pr-8">
        <SheetTitle className="text-xl font-semibold">Crear ejercicio</SheetTitle>
        <SheetDescription>Se guarda en tu catálogo y se añade ahora mismo.</SheetDescription>
      </div>

      <div className="space-y-2">
        <Label htmlFor={nameId}>Nombre</Label>
        <Input
          id={nameId}
          className="h-11"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Ej.: Remo en máquina Hammer"
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Músculo principal</legend>
        <div className="flex flex-wrap gap-2">
          {MUSCLE_OPTIONS.map(([value, label]) => (
            <OptionChip
              key={value}
              label={label}
              pressed={muscle === value}
              onClick={() => setMuscle(value)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Material</legend>
        <div className="flex flex-wrap gap-2">
          <OptionChip label="Ninguno" pressed={equipment === null} onClick={() => setEquipment(null)} />
          {EQUIPMENT_OPTIONS.map(([value, label]) => (
            <OptionChip
              key={value}
              label={label}
              pressed={equipment === value}
              onClick={() => setEquipment(value)}
            />
          ))}
        </div>
      </fieldset>

      {createExercise.error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{createErrorMessage(createExercise.error)}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        size="lg"
        className="h-12 w-full text-base"
        disabled={name.trim() === '' || muscle === null || createExercise.isPending}
      >
        {createExercise.isPending
          ? 'Creando…'
          : muscle === null
            ? 'Elige el músculo principal'
            : 'Crear y añadir'}
      </Button>
    </form>
  )
}

function createErrorMessage(error: Error): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'Ya tienes un ejercicio con ese nombre. Búscalo en la lista.'
  }
  return 'No se pudo crear el ejercicio. Comprueba la conexión y prueba otra vez.'
}
