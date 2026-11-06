import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronRightIcon, Trash2Icon } from 'lucide-react'
import { useId, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { DecimalInput } from '@/components/DecimalInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/features/auth/AuthForm'
import { ApiError } from '@/lib/api'
import { formatDay, formatKg } from '@/lib/format'
import type { BodyMeasurement } from '@/lib/types'
import {
  emptyMeasurementForm,
  formToMeasurementPayload,
  hasOptionalValues,
  localToday,
  measurementFormSchema,
  measurementToForm,
  OPTIONAL_FIELDS,
  type MeasurementFormValues,
} from './measurement-form'
import { useDeleteMeasurement, useSaveMeasurement } from './queries'

function saveErrorMessage(error: Error): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'Ya hay una medida para esa fecha. Recarga la página para editarla.'
  }
  return 'No se pudo guardar la medida. Inténtalo de nuevo.'
}

interface MeasurementFormProps {
  measurements: BodyMeasurement[]
  initialDate: string
}

/**
 * Logs the measurement for a day. Choosing a date that already has one loads it for editing,
 * since the API allows a single entry per day.
 */
export function MeasurementForm({ measurements, initialDate }: MeasurementFormProps) {
  const baseId = useId()
  const saveMeasurement = useSaveMeasurement()
  const deleteMeasurement = useDeleteMeasurement()
  const byDate = new Map(measurements.map((measurement) => [measurement.measured_on, measurement]))
  const valuesFor = (date: string) => {
    const existing = byDate.get(date)
    return existing ? measurementToForm(existing) : emptyMeasurementForm(date)
  }

  const [defaultValues] = useState(() => valuesFor(initialDate))
  const [showMore, setShowMore] = useState(() => hasOptionalValues(defaultValues))
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<MeasurementFormValues>({ resolver: zodResolver(measurementFormSchema), defaultValues })

  const measuredOn = useWatch({ control, name: 'measuredOn' })
  const editing = byDate.get(measuredOn)
  const lastWeight = measurements.findLast((measurement) => measurement.weight_kg !== null)?.weight_kg

  const load = (values: MeasurementFormValues) => {
    reset(values)
    setShowMore(hasOptionalValues(values))
  }

  const onSubmit = handleSubmit(
    async (values) => {
      try {
        await saveMeasurement.mutateAsync({ id: editing?.id, payload: formToMeasurementPayload(values) })
        toast.success(editing ? 'Medida actualizada' : 'Medida guardada')
      } catch {
        // The error is rendered from the mutation state.
      }
    },
    (invalid) => {
      if (OPTIONAL_FIELDS.some(({ key }) => invalid[key])) {
        setShowMore(true)
      }
    },
  )

  const onDelete = async () => {
    if (!editing || !window.confirm(`¿Eliminar la medida del ${formatDay(editing.measured_on)}?`)) {
      return
    }
    try {
      await deleteMeasurement.mutateAsync(editing.id)
      load(emptyMeasurementForm(editing.measured_on))
      toast.success('Medida eliminada')
    } catch {
      toast.error('No se pudo eliminar la medida.')
    }
  }

  // Said in words: a grey number inside the field read as if it were already filled in.
  const weightHint = !editing && lastWeight ? `La última vez: ${formatKg(lastWeight)}` : null
  const weightDescription =
    [errors.weightKg && `${baseId}-weight-error`, weightHint && `${baseId}-weight-hint`]
      .filter(Boolean)
      .join(' ') || undefined

  const optionalErrors = OPTIONAL_FIELDS.map(({ key }) => errors[key]?.message).filter(Boolean)

  return (
    <form className="bg-card space-y-4 rounded-xl border p-4" onSubmit={onSubmit} noValidate>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-medium">{editing ? 'Editar medida' : 'Nueva medida'}</h2>
        {editing && <span className="text-muted-foreground text-sm">Ya registraste este día</span>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          id={`${baseId}-date`}
          label="Fecha"
          type="date"
          max={localToday()}
          error={errors.measuredOn?.message}
          {...register('measuredOn', {
            onChange: (event: { target: { value: string } }) => {
              const date = event.target.value
              // Load the day's entry, or clear the values that belonged to the one being edited.
              if (byDate.has(date) || editing) {
                load(valuesFor(date))
              }
            },
          })}
        />
        <div className="space-y-2">
          <Label htmlFor={`${baseId}-weight`}>Peso (kg)</Label>
          <DecimalInput
            id={`${baseId}-weight`}
            control={control}
            name="weightKg"
            placeholder="—"
            className="h-11 text-lg font-semibold tabular-nums"
            aria-invalid={errors.weightKg ? true : undefined}
            aria-describedby={weightDescription}
          />
          {weightHint && (
            <p id={`${baseId}-weight-hint`} className="text-muted-foreground text-sm tabular-nums">
              {weightHint}
            </p>
          )}
        </div>
      </div>
      {errors.weightKg && (
        <p id={`${baseId}-weight-error`} className="text-destructive -mt-2 text-sm">
          {errors.weightKg.message}
        </p>
      )}

      <div className="space-y-3">
        <Button
          type="button"
          variant="ghost"
          className="-ml-2"
          aria-expanded={showMore}
          aria-controls={`${baseId}-more`}
          onClick={() => setShowMore((open) => !open)}
        >
          <ChevronRightIcon
            className={showMore ? 'rotate-90 transition-transform' : 'transition-transform'}
          />
          Más medidas
        </Button>
        <div id={`${baseId}-more`} className="space-y-3" hidden={!showMore}>
          <div className="grid grid-cols-2 gap-3">
            {OPTIONAL_FIELDS.map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`${baseId}-${key}`} className="text-muted-foreground text-xs">
                  {label}
                </Label>
                <DecimalInput
                  id={`${baseId}-${key}`}
                  control={control}
                  name={key}
                  placeholder={placeholder}
                  className="h-10 tabular-nums"
                  aria-invalid={errors[key] ? true : undefined}
                />
              </div>
            ))}
          </div>
          {optionalErrors.length > 0 && (
            <p className="text-destructive text-sm">{optionalErrors.join(' · ')}</p>
          )}
          <div className="space-y-1">
            <Label htmlFor={`${baseId}-notes`} className="text-muted-foreground text-xs">
              Notas (opcional)
            </Label>
            <Textarea
              id={`${baseId}-notes`}
              placeholder="Ej.: en ayunas, después de un día de descanso"
              aria-invalid={errors.notes ? true : undefined}
              {...register('notes')}
            />
            {errors.notes && <p className="text-destructive text-sm">{errors.notes.message}</p>}
          </div>
        </div>
      </div>

      {saveMeasurement.error && (
        <Alert variant="destructive">
          <AlertDescription>{saveErrorMessage(saveMeasurement.error)}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button
          type="submit"
          size="lg"
          className="h-12 flex-1 text-base"
          disabled={saveMeasurement.isPending}
        >
          {saveMeasurement.isPending ? 'Guardando…' : 'Guardar medida'}
        </Button>
        {editing && (
          <Button
            type="button"
            variant="destructive"
            size="icon-lg"
            className="size-12"
            aria-label="Eliminar medida"
            disabled={deleteMeasurement.isPending}
            onClick={onDelete}
          >
            <Trash2Icon />
          </Button>
        )}
      </div>
    </form>
  )
}
