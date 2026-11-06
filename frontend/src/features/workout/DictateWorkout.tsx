import { SparklesIcon, TriangleAlertIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { formatDecimal, plural } from '@/lib/format'
import type { Dictation, DictationExercise } from '@/lib/types'
import type { DictatedEntry } from './draft'
import { ExercisePicker } from './ExercisePicker'
import { useReadDictation } from './queries'

// Marked as an example and dimmed, so it never reads as text already typed in.
const PLACEHOLDER = 'Ej.: prensa 4x10 120\npress banca 12,10,8 a 60 rpe 8\ndominadas 3x8'

/** A read line written out: "4 series · 10 reps · 60 kg · RPE 8". */
function describe(exercise: DictationExercise): string {
  const [first] = exercise.sets
  const reps = exercise.sets.map((set) => set.reps).filter((value) => value !== null)
  const sameReps = new Set(reps).size === 1
  return [
    `${exercise.sets.length} ${plural(exercise.sets.length, 'serie', 'series')}`,
    reps.length === 0 ? null : sameReps ? `${reps[0]} reps` : reps.join(', '),
    first?.weight_kg == null ? null : `${formatDecimal(first.weight_kg)} kg`,
    first?.rpe == null ? null : `RPE ${formatDecimal(first.rpe)}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

interface DictateWorkoutProps {
  onStart: (entries: DictatedEntry[]) => void
}

/**
 * Writing (or dictating with the phone keyboard) a whole workout in one go. The reading happens on
 * the server and is only ever a proposal: the user resolves whatever it could not match, and every
 * set is reviewed in the workout screen before anything is saved.
 */
export function DictateWorkout({ onStart }: DictateWorkoutProps) {
  const fieldId = useId()
  const [text, setText] = useState('')
  const [dictation, setDictation] = useState<Dictation | null>(null)
  // Exercises settled by the user for the lines the reader left open, keyed by their position.
  const [resolved, setResolved] = useState<Record<number, { id: number; name: string }>>({})
  const [picking, setPicking] = useState<number | null>(null)
  const read = useReadDictation()

  const exerciseFor = (exercise: DictationExercise, index: number) =>
    exercise.exercise_id === null ? resolved[index] : { id: exercise.exercise_id, name: exercise.name }

  const submit = () => {
    read.mutate(text, {
      onSuccess: (result) => {
        setDictation(result)
        setResolved({})
      },
    })
  }

  const start = () => {
    const entries = (dictation?.exercises ?? []).flatMap((exercise, index) => {
      const match = exerciseFor(exercise, index)
      if (match === undefined) {
        return []
      }
      return [
        {
          exerciseId: match.id,
          name: match.name,
          sets: exercise.sets.map((set) => ({
            reps: set.reps,
            weightKg: set.weight_kg,
            rpe: set.rpe,
          })),
        },
      ]
    })
    onStart(entries)
  }

  const ready =
    dictation?.exercises.filter((exercise, index) => exerciseFor(exercise, index) !== undefined).length ?? 0

  return (
    <section className="bg-card ring-foreground/10 space-y-3 rounded-xl p-4 ring-1">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-medium">
          <SparklesIcon className="text-primary size-4" aria-hidden />
          Cuéntame tu entreno
        </h2>
        <p className="text-muted-foreground text-sm">
          Escríbelo como lo apuntarías, o dictalo con el micrófono del teclado. Lo repasamos antes de empezar.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={fieldId} className="sr-only">
          Tu entreno
        </Label>
        <Textarea
          id={fieldId}
          rows={3}
          value={text}
          placeholder={PLACEHOLDER}
          className="placeholder:text-muted-foreground/60"
          onChange={(event) => setText(event.target.value)}
        />
        <Button className="h-11 w-full" disabled={text.trim() === '' || read.isPending} onClick={submit}>
          {read.isPending ? 'Leyendo…' : 'Leer entreno'}
        </Button>
      </div>

      {read.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {read.error instanceof ApiError && read.error.status === 429
              ? 'Has hecho muchas lecturas seguidas. Espera un momento e inténtalo de nuevo.'
              : 'No se pudo leer el texto. Inténtalo de nuevo.'}
          </AlertDescription>
        </Alert>
      )}

      {dictation !== null && dictation.exercises.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No he reconocido ningún ejercicio. Prueba con algo como «prensa 4x10 120».
        </p>
      )}

      {dictation !== null && dictation.exercises.length > 0 && (
        <div className="space-y-3">
          <ul className="divide-y rounded-lg border">
            {dictation.exercises.map((exercise, index) => {
              const match = exerciseFor(exercise, index)
              return (
                <li key={`${exercise.query}-${index}`} className="min-w-0 space-y-2 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{match?.name ?? exercise.query}</span>
                      <span className="text-muted-foreground block text-sm tabular-nums">
                        {describe(exercise)}
                      </span>
                    </span>
                    {match === undefined && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => setPicking(index)}
                      >
                        Buscar
                      </Button>
                    )}
                  </div>
                  {/* "press banca" fits the barbell and the dumbbell entry equally: offer both
                      rather than guess, since the wrong one quietly spoils the history. */}
                  {match === undefined && exercise.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-muted-foreground w-full text-xs">¿Cuál de estos?</span>
                      {exercise.suggestions.map((suggestion) => (
                        <Button
                          key={suggestion.id}
                          variant="secondary"
                          size="sm"
                          onClick={() => setResolved((current) => ({ ...current, [index]: suggestion }))}
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

          {ready < dictation.exercises.length && (
            <Alert>
              <TriangleAlertIcon />
              <AlertDescription>
                Hay algo que no he reconocido. Elígelo tú, o empieza sin ello y añádelo luego.
              </AlertDescription>
            </Alert>
          )}

          <Button size="lg" className="h-12 w-full text-base" disabled={ready === 0} onClick={start}>
            Empezar con {ready} {plural(ready, 'ejercicio', 'ejercicios')}
          </Button>
        </div>
      )}

      <ExercisePicker
        open={picking !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPicking(null)
          }
        }}
        onSelect={(exercise) => {
          if (picking !== null) {
            setResolved((current) => ({ ...current, [picking]: exercise }))
          }
          setPicking(null)
        }}
      />
    </section>
  )
}
