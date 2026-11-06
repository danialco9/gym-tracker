import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronLeftIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { Link, useBlocker, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/features/auth/AuthForm'
import { ExercisePicker } from '@/features/workout/ExercisePicker'
import { ApiError } from '@/lib/api'
import type { Routine } from '@/lib/types'
import { useCreateRoutine, useDeleteRoutine, useUpdateRoutine } from './queries'
import {
  DEFAULT_SET_COUNT,
  emptyRoutineForm,
  emptySet,
  formToRoutinePayload,
  routineFormSchema,
  routineToForm,
  type RoutineFormValues,
} from './routine-form'
import { RoutineExerciseFields } from './RoutineExerciseFields'

function saveErrorMessage(error: Error): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'Ya tienes una rutina con ese nombre'
  }
  if (error instanceof ApiError && error.status === 422) {
    return 'Algún ejercicio ya no está disponible. Revisa la lista e inténtalo de nuevo.'
  }
  return 'No se pudo guardar la rutina. Inténtalo de nuevo.'
}

const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    'Para mover un ejercicio, pulsa espacio o intro. Usa las flechas arriba y abajo para cambiar su posición, espacio o intro para soltarlo y escape para cancelar.',
}

/**
 * Asks before leaving with unsaved changes: in the app, and when the page itself closes or reloads.
 * Returns the way out after saving or deleting, which needs no question.
 */
function useLeaveGuard(dirty: boolean): () => void {
  const done = useRef(false)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !done.current && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (blocker.state !== 'blocked') {
      return
    }
    if (window.confirm('¿Salir sin guardar? Perderás los cambios de esta rutina.')) {
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker])

  useEffect(() => {
    if (!dirty) {
      return
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return () => {
    done.current = true
  }
}

interface RoutineEditorProps {
  routine?: Routine
}

export function RoutineEditor({ routine }: RoutineEditorProps) {
  const navigate = useNavigate()
  const createRoutine = useCreateRoutine()
  const updateRoutine = useUpdateRoutine(routine?.id)
  const deleteRoutine = useDeleteRoutine()
  const [pickerOpen, setPickerOpen] = useState(false)
  const {
    register,
    control,
    getValues,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<RoutineFormValues>({
    resolver: zodResolver(routineFormSchema),
    defaultValues: routine ? routineToForm(routine) : emptyRoutineForm,
  })
  const { fields, append, remove, move } = useFieldArray({ control, name: 'exercises' })
  const allowLeaving = useLeaveGuard(isDirty)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const positionOf = (id: string | number) => fields.findIndex((field) => field.id === id) + 1
  const nameOf = (id: string | number) => fields.find((field) => field.id === id)?.name ?? 'Ejercicio'
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Moviendo ${nameOf(active.id)}, posición ${positionOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nameOf(active.id)} pasa a la posición ${positionOf(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `${nameOf(active.id)} colocado en la posición ${positionOf(over.id)}.` : undefined,
    onDragCancel: ({ active }) => `Movimiento cancelado. ${nameOf(active.id)} vuelve a su posición.`,
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) {
      move(positionOf(active.id) - 1, positionOf(over.id) - 1)
    }
  }

  const saving = createRoutine.isPending || updateRoutine.isPending
  const saveError = createRoutine.error ?? updateRoutine.error
  const exercisesError = errors.exercises?.root?.message ?? errors.exercises?.message

  const onSubmit = handleSubmit(async (values) => {
    const payload = formToRoutinePayload(values)
    try {
      if (routine) {
        await updateRoutine.mutateAsync(payload)
      } else {
        await createRoutine.mutateAsync(payload)
      }
      toast.success(routine ? 'Rutina actualizada' : 'Rutina creada')
      allowLeaving()
      navigate('/rutinas')
    } catch {
      // The error is rendered from the mutation state.
    }
  })

  const onDelete = async () => {
    const confirmed = window.confirm(
      `¿Eliminar la rutina "${routine?.name}"? Los entrenos que ya registraste se conservan.`,
    )
    if (!routine || !confirmed) {
      return
    }
    try {
      await deleteRoutine.mutateAsync(routine.id)
      toast.success('Rutina eliminada')
      allowLeaving()
      navigate('/rutinas')
    } catch {
      toast.error('No se pudo eliminar la rutina.')
    }
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit} noValidate>
      <header className="space-y-1">
        <Link
          to="/rutinas"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
          Volver a rutinas
        </Link>
        <h1 className="font-heading text-2xl font-semibold">{routine ? 'Editar rutina' : 'Nueva rutina'}</h1>
      </header>

      <FormField
        id="routine-name"
        label="Nombre"
        placeholder="Ej.: Pierna"
        error={errors.name?.message}
        {...register('name')}
      />

      <div className="space-y-2">
        <Label htmlFor="routine-description">Descripción (opcional)</Label>
        <Textarea
          id="routine-description"
          placeholder="Ej.: Miércoles, foco en cuádriceps"
          aria-invalid={errors.description ? true : undefined}
          {...register('description')}
        />
        {errors.description && <p className="text-destructive text-sm">{errors.description.message}</p>}
      </div>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-medium">Ejercicios</h2>
          <p className="text-muted-foreground text-sm">
            Arrastra desde el asa para ordenarlos. Cada serie puede tener sus reps, peso y RPE (todo
            opcional); se precargan al empezar el entreno.
          </p>
        </div>
        {fields.length === 0 && (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            Todavía no hay ejercicios en esta rutina.
          </p>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          accessibility={{ announcements, screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={fields} strategy={verticalListSortingStrategy}>
            <ol className="space-y-3">
              {fields.map((field, index) => (
                <li key={field.id}>
                  <RoutineExerciseFields
                    id={field.id}
                    index={index}
                    name={field.name}
                    control={control}
                    getValues={getValues}
                    errors={errors.exercises?.[index]}
                    onRemove={() => remove(index)}
                  />
                </li>
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        {exercisesError && <p className="text-destructive text-sm">{exercisesError}</p>}
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 w-full text-base"
          onClick={() => setPickerOpen(true)}
        >
          <PlusIcon />
          Añadir ejercicio
        </Button>
      </section>

      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>{saveErrorMessage(saveError)}</AlertDescription>
        </Alert>
      )}

      {routine && (
        <Button
          type="button"
          variant="destructive"
          className="h-10 w-full"
          disabled={deleteRoutine.isPending}
          onClick={onDelete}
        >
          <Trash2Icon />
          Eliminar rutina
        </Button>
      )}

      {/* Fixed just above the bottom nav (the layout's bottom padding leaves room for it), so a change
          at the top saves without scrolling past every exercise; from lg up it sticks to the content. */}
      <div className="bg-background/95 fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t px-4 py-3 backdrop-blur lg:sticky lg:bottom-0 lg:-mx-2 lg:px-2">
        <Button
          type="submit"
          size="lg"
          className="mx-auto flex h-12 w-full max-w-2xl text-base"
          disabled={saving}
        >
          {saving ? 'Guardando…' : 'Guardar rutina'}
        </Button>
      </div>

      <ExercisePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(exercise) => {
          append({
            exerciseId: exercise.id,
            name: exercise.name,
            sets: Array.from({ length: DEFAULT_SET_COUNT }, emptySet),
          })
          setPickerOpen(false)
        }}
      />
    </form>
  )
}
