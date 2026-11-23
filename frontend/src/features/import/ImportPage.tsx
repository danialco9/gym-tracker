import { CheckIcon, FileUpIcon, SearchIcon, TriangleAlertIcon } from 'lucide-react'
import { type ChangeEvent, useId, useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { ExercisePicker } from '@/features/workout/ExercisePicker'
import { ApiError } from '@/lib/api'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  type ImportOption,
  type ImportPreview,
  type ImportResult,
  type ImportSource,
  MAX_IMPORT_CHARS,
  useImportWorkouts,
  usePreviewImport,
} from './queries'

// Old history spans years, so the dates carry the year: "15 ene 2024".
const dayFormatter = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const formatDay = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number)
  return dayFormatter.format(new Date(year, month - 1, day))
}

const SOURCE_NAMES: Record<ImportSource, string> = {
  strong: 'Strong',
  hevy: 'Hevy',
  gym_tracker: 'una copia de esta app',
}

function readError(error: unknown): string {
  if (error instanceof ApiError && error.status === 422) {
    return 'Este archivo no parece una exportación de Strong, de Hevy ni de esta app. Revisa que sea el CSV de entrenos.'
  }
  if (error instanceof ApiError && error.status === 413) {
    return 'El archivo es demasiado grande.'
  }
  return 'No se pudo leer el archivo. Comprueba la conexión y prueba otra vez.'
}

function ChooseFile({ onRead }: { onRead: (content: string, preview: ImportPreview) => void }) {
  const inputId = useId()
  const preview = usePreviewImport()
  const [tooBig, setTooBig] = useState(false)

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Lets the same file be picked again after fixing something.
    event.target.value = ''
    if (file === undefined) {
      return
    }
    const content = await file.text()
    setTooBig(content.length > MAX_IMPORT_CHARS)
    if (content.length > MAX_IMPORT_CHARS) {
      return
    }
    preview.mutate(content, { onSuccess: (result) => onRead(content, result) })
  }

  return (
    <section className="space-y-4">
      <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
        <li>En tu otra app, busca en los ajustes la opción de exportar los entrenos a CSV.</li>
        <li>Elige aquí ese archivo. Antes de guardar nada te enseño lo que he encontrado.</li>
      </ol>
      <input
        id={inputId}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        disabled={preview.isPending}
        onChange={(event) => void pick(event)}
      />
      <label
        htmlFor={inputId}
        className={cn(
          buttonVariants({ size: 'lg' }),
          'h-12 w-full cursor-pointer text-base',
          preview.isPending && 'pointer-events-none opacity-50',
        )}
      >
        <FileUpIcon aria-hidden />
        {preview.isPending ? 'Leyendo el archivo…' : 'Elegir archivo CSV'}
      </label>
      {(tooBig || preview.isError) && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>
            {tooBig ? 'El archivo es demasiado grande.' : readError(preview.error)}
          </AlertDescription>
        </Alert>
      )}
    </section>
  )
}

function ChooseExercises({
  preview,
  chosen,
  onChoose,
  onDone,
}: {
  preview: ImportPreview
  chosen: Record<string, ImportOption>
  onChoose: (name: string, exercise: ImportOption) => void
  onDone: () => void
}) {
  const [picking, setPicking] = useState<string | null>(null)
  const unmatched = preview.exercises.filter((exercise) => exercise.exercise_id === null)
  const missing = unmatched.filter((exercise) => chosen[exercise.name] === undefined).length

  return (
    <section className="space-y-4">
      <p className="text-muted-foreground text-sm">
        No sé a qué ejercicio corresponde{' '}
        {unmatched.length === 1 ? 'este nombre' : 'cada uno de estos nombres'}. Elígelo tú: si no está, desde{' '}
        <em>Buscar</em> puedes crearlo.
      </p>
      <ul className="space-y-2">
        {unmatched.map((exercise) => {
          const choice = chosen[exercise.name]
          return (
            <li key={exercise.name} className="bg-card ring-foreground/10 space-y-2 rounded-xl p-3 ring-1">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{exercise.name}</span>
                  <span className="text-muted-foreground block text-sm">
                    {choice === undefined ? (
                      `${exercise.sets} ${plural(exercise.sets, 'serie', 'series')}`
                    ) : (
                      <span className="text-primary inline-flex items-center gap-1">
                        <CheckIcon className="size-3.5" aria-hidden />
                        {choice.name}
                      </span>
                    )}
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  aria-label={`${choice === undefined ? 'Buscar' : 'Cambiar'} ejercicio para ${exercise.name}`}
                  onClick={() => setPicking(exercise.name)}
                >
                  <SearchIcon aria-hidden />
                  {choice === undefined ? 'Buscar' : 'Cambiar'}
                </Button>
              </div>
              {exercise.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {exercise.suggestions.map((suggestion) => (
                    <Button
                      key={suggestion.id}
                      variant={choice?.id === suggestion.id ? 'default' : 'secondary'}
                      size="sm"
                      aria-pressed={choice?.id === suggestion.id}
                      onClick={() => onChoose(exercise.name, suggestion)}
                    >
                      {suggestion.name}
                    </Button>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <Button size="lg" className="h-12 w-full text-base" disabled={missing > 0} onClick={onDone}>
        {missing > 0 ? `Faltan ${missing} por elegir` : 'Seguir'}
      </Button>
      <ExercisePicker
        open={picking !== null}
        title="Elegir ejercicio"
        selectLabel="Elegir"
        onOpenChange={(open) => {
          if (!open) {
            setPicking(null)
          }
        }}
        onSelect={(exercise) => {
          if (picking !== null) {
            onChoose(picking, { id: exercise.id, name: exercise.name })
          }
          setPicking(null)
        }}
      />
    </section>
  )
}

function Summary({
  preview,
  content,
  chosen,
  onImported,
  onRestart,
}: {
  preview: ImportPreview
  content: string
  chosen: Record<string, ImportOption>
  onImported: (result: ImportResult) => void
  onRestart: () => void
}) {
  const save = useImportWorkouts()

  if (preview.workouts === 0) {
    return (
      <section className="space-y-4">
        <p>Todos los entrenos de este archivo ya están en tu cuenta. No hay nada nuevo que importar.</p>
        <Button variant="outline" size="lg" className="h-12 w-full text-base" onClick={onRestart}>
          Elegir otro archivo
        </Button>
      </section>
    )
  }

  const importAll = () =>
    save.mutate(
      {
        content,
        exercise_ids: Object.fromEntries(Object.entries(chosen).map(([name, option]) => [name, option.id])),
      },
      { onSuccess: onImported },
    )

  return (
    <section className="space-y-4">
      <div className="bg-card ring-foreground/10 space-y-1 rounded-xl p-4 ring-1">
        <p className="text-muted-foreground text-sm">Desde {SOURCE_NAMES[preview.source]}</p>
        <p className="font-heading text-xl font-semibold">
          {preview.workouts} {plural(preview.workouts, 'entreno', 'entrenos')} · {preview.sets}{' '}
          {plural(preview.sets, 'serie', 'series')}
        </p>
        {preview.first_date !== null && preview.last_date !== null && (
          <p className="text-muted-foreground text-sm">
            {preview.first_date === preview.last_date
              ? `El ${formatDay(preview.first_date)}`
              : `Del ${formatDay(preview.first_date)} al ${formatDay(preview.last_date)}`}
          </p>
        )}
      </div>
      {(preview.duplicates > 0 || preview.skipped_rows > 0) && (
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
          {preview.duplicates > 0 && (
            <li>
              {preview.duplicates} {plural(preview.duplicates, 'entreno ya estaba', 'entrenos ya estaban')} en
              tu cuenta: no se repiten.
            </li>
          )}
          {preview.skipped_rows > 0 && (
            <li>
              {plural(preview.skipped_rows, 'Se salta', 'Se saltan')} {preview.skipped_rows}{' '}
              {plural(preview.skipped_rows, 'fila', 'filas')} sin repeticiones, como el cardio o los
              descansos.
            </li>
          )}
        </ul>
      )}
      {save.isError && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>No se pudo importar. Comprueba la conexión y prueba otra vez.</AlertDescription>
        </Alert>
      )}
      <Button size="lg" className="h-12 w-full text-base" disabled={save.isPending} onClick={importAll}>
        {save.isPending
          ? 'Importando…'
          : `Importar ${preview.workouts} ${plural(preview.workouts, 'entreno', 'entrenos')}`}
      </Button>
      <Button variant="ghost" className="w-full" disabled={save.isPending} onClick={onRestart}>
        Elegir otro archivo
      </Button>
    </section>
  )
}

function Done({ result }: { result: ImportResult }) {
  return (
    <section className="space-y-4">
      <div className="bg-card ring-foreground/10 flex items-center gap-3 rounded-xl p-4 ring-1">
        <CheckIcon className="text-primary size-6 shrink-0" aria-hidden />
        <p>
          Listo: {result.workouts} {plural(result.workouts, 'entreno importado', 'entrenos importados')} con{' '}
          {result.sets} {plural(result.sets, 'serie', 'series')}. Ya cuentan en tu progreso y tu calendario.
        </p>
      </div>
      <Link to="/progreso" className={cn(buttonVariants({ size: 'lg' }), 'h-12 w-full text-base')}>
        Ver mi progreso
      </Link>
      <Link to="/cuenta" className={cn(buttonVariants({ variant: 'ghost' }), 'w-full')}>
        Volver a tu cuenta
      </Link>
    </section>
  )
}

type Step =
  | { kind: 'file' }
  | { kind: 'exercises' | 'summary'; content: string; preview: ImportPreview }
  | { kind: 'done'; result: ImportResult }

const TITLES: Record<Step['kind'], string> = {
  file: 'Importar entrenos',
  exercises: 'Elige los ejercicios',
  summary: '¿Lo importo?',
  done: 'Entrenos importados',
}

/**
 * Brings in workouts from a CSV of Strong, Hevy or this app, one step per screen: the file, the
 * exercise names it could not match, and what will be saved. Nothing is saved before the last one.
 */
export function ImportPage() {
  const [step, setStep] = useState<Step>({ kind: 'file' })
  const [chosen, setChosen] = useState<Record<string, ImportOption>>({})
  const restart = () => {
    setChosen({})
    setStep({ kind: 'file' })
  }

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        eyebrow="Tus datos"
        title={
          step.kind === 'summary' && step.preview.workouts === 0 ? 'Ya lo tienes todo' : TITLES[step.kind]
        }
        description="Trae tu historial desde Strong, Hevy o una copia de esta app."
      />
      {step.kind === 'file' && (
        <ChooseFile
          onRead={(content, preview) => {
            const unmatched = preview.exercises.some((exercise) => exercise.exercise_id === null)
            setStep({ kind: unmatched ? 'exercises' : 'summary', content, preview })
          }}
        />
      )}
      {step.kind === 'exercises' && (
        <ChooseExercises
          preview={step.preview}
          chosen={chosen}
          onChoose={(name, exercise) => setChosen((current) => ({ ...current, [name]: exercise }))}
          onDone={() => setStep({ ...step, kind: 'summary' })}
        />
      )}
      {step.kind === 'summary' && (
        <Summary
          preview={step.preview}
          content={step.content}
          chosen={chosen}
          onImported={(result) => setStep({ kind: 'done', result })}
          onRestart={restart}
        />
      )}
      {step.kind === 'done' && <Done result={step.result} />}
    </div>
  )
}
