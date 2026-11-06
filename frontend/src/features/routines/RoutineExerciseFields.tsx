import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVerticalIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useState } from 'react'
import {
  useController,
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormGetValues,
} from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  MAX_SETS_PER_EXERCISE,
  nextSet,
  parseOptionalNumber,
  type RoutineExerciseValues,
  type RoutineFormValues,
} from './routine-form'

// `label` names the field for screen readers; `column` is the narrow heading a phone has room for.
const SET_FIELDS = [
  { key: 'targetReps', label: 'Reps', column: 'Reps', inputMode: 'numeric' },
  { key: 'targetWeightKg', label: 'Peso (kg)', column: 'Peso', inputMode: 'decimal' },
  { key: 'targetRpe', label: 'RPE', column: 'RPE', inputMode: 'decimal' },
] as const

type SetFieldKey = (typeof SET_FIELDS)[number]['key']

/** Spanish decimals, as everywhere else in the app: 37,5 rather than 37.5. */
const toInputText = (value: number | null) => (value === null ? '' : String(value).replace('.', ','))

interface TargetInputProps {
  control: Control<RoutineFormValues>
  name: `exercises.${number}.sets.${number}.${SetFieldKey}`
  label: string
  inputMode: 'numeric' | 'decimal'
  invalid: boolean
}

function TargetInput({ control, name, label, inputMode, invalid }: TargetInputProps) {
  const {
    field: { ref, value, onChange, onBlur },
  } = useController({ control, name })
  // What is being typed, so "37," survives until the 5 arrives; the form keeps the number.
  const [text, setText] = useState(() => toInputText(value))
  return (
    <Input
      ref={ref}
      name={name}
      inputMode={inputMode}
      // An empty target is a dash, never a sample number that reads like a real one.
      placeholder="—"
      aria-label={label}
      className="h-10 px-1 text-center tabular-nums"
      aria-invalid={invalid ? true : undefined}
      value={text}
      onChange={(event) => {
        setText(event.target.value)
        onChange(parseOptionalNumber(event.target.value))
      }}
      onBlur={onBlur}
    />
  )
}

const GRID = 'grid grid-cols-[1.75rem_1fr_1fr_1fr_2.25rem] items-center gap-1.5 sm:gap-2'

interface RoutineExerciseFieldsProps {
  /** Stable id from the field array, used by the drag-and-drop list. */
  id: string
  index: number
  name: string
  control: Control<RoutineFormValues>
  getValues: UseFormGetValues<RoutineFormValues>
  errors?: FieldErrors<RoutineExerciseValues>
  onRemove: () => void
}

export function RoutineExerciseFields({
  id,
  index,
  name,
  control,
  getValues,
  errors,
  onRemove,
}: RoutineExerciseFieldsProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id,
    })
  const sets = useFieldArray({ control, name: `exercises.${index}.sets` })

  const setErrors = errors?.sets
  const perSet = Array.isArray(setErrors) ? setErrors : []
  const messages = [
    ...new Set([
      ...perSet.flatMap((item) => SET_FIELDS.map(({ key }) => item?.[key]?.message)),
      setErrors?.root?.message,
      setErrors?.message,
    ]),
  ].filter(Boolean)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('bg-card space-y-3 rounded-xl border p-3', isDragging && 'relative z-10 shadow-lg')}
    >
      <div className="flex items-center gap-2">
        <Button
          ref={setActivatorNodeRef}
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground cursor-grab touch-none active:cursor-grabbing"
          aria-label={`Mover ${name}`}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon />
        </Button>
        <p className="min-w-0 flex-1 font-medium">
          <span className="text-muted-foreground mr-2 tabular-nums">{index + 1}.</span>
          {name}
        </p>
        <Button type="button" variant="ghost" size="icon" aria-label={`Quitar ${name}`} onClick={onRemove}>
          <Trash2Icon />
        </Button>
      </div>

      {sets.fields.length > 0 && (
        <div className="space-y-2">
          <div className={cn(GRID, 'text-muted-foreground text-xs')} aria-hidden>
            <span className="text-center">Serie</span>
            {SET_FIELDS.map(({ key, column }) => (
              <span key={key} className="text-center">
                {column}
              </span>
            ))}
          </div>
          <ol className="space-y-2">
            {sets.fields.map((field, setIndex) => (
              <li key={field.id} className={GRID}>
                <span className="text-muted-foreground text-center text-sm tabular-nums">{setIndex + 1}</span>
                {SET_FIELDS.map(({ key, label, inputMode }) => (
                  <TargetInput
                    key={key}
                    control={control}
                    name={`exercises.${index}.sets.${setIndex}.${key}`}
                    label={`Serie ${setIndex + 1}: ${label}`}
                    inputMode={inputMode}
                    invalid={Boolean(errors?.sets?.[setIndex]?.[key])}
                  />
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Quitar serie ${setIndex + 1} de ${name}`}
                  onClick={() => sets.remove(setIndex)}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {messages.length > 0 && <p className="text-destructive text-sm">{messages.join(' · ')}</p>}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={sets.fields.length >= MAX_SETS_PER_EXERCISE}
        onClick={() => sets.append(nextSet(getValues(`exercises.${index}.sets`).at(-1)))}
      >
        <PlusIcon />
        Añadir serie
      </Button>
    </div>
  )
}
