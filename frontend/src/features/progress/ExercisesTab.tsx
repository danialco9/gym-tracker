import { lazy, Suspense, useId, useState } from 'react'
import { QueryStatus } from '@/components/QueryStatus'
import { formatDay, formatDecimal, formatKg, formatShortDay } from '@/lib/format'
import { MUSCLE_GROUP_LABELS } from '@/lib/labels'
import type { PersonalRecord } from '@/lib/types'
import { forecastMessage } from './forecast'
import { ChartFallback, DataTable, EmptyState, StatTile } from './ProgressParts'
import { useExerciseProgress } from './queries'

const ExerciseChart = lazy(() =>
  import('./ProgressCharts').then((module) => ({ default: module.ExerciseChart })),
)

const SELECT_CLASS =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-lg border px-3 text-base outline-none focus-visible:ring-3'

export function ExercisesTab({ records }: { records: PersonalRecord[] }) {
  const selectId = useId()
  const [selectedId, setSelectedId] = useState<number | null>(
    () => records.toSorted((a, b) => b.sessions - a.sessions)[0]?.exercise_id ?? null,
  )
  const progress = useExerciseProgress(selectedId)
  const record = records.find((item) => item.exercise_id === selectedId)

  if (records.length === 0 || record === undefined) {
    return <EmptyState>Cuando registres entrenos verás aquí la evolución de cada ejercicio.</EmptyState>
  }
  const sessions = progress.data?.sessions ?? []

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor={selectId} className="text-sm font-medium">
          Ejercicio
        </label>
        <select
          id={selectId}
          className={SELECT_CLASS}
          value={record.exercise_id}
          onChange={(event) => setSelectedId(Number(event.target.value))}
        >
          {records.map((item) => (
            <option key={item.exercise_id} value={item.exercise_id}>
              {item.exercise_name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile
          label="Mejor e1RM"
          value={formatKg(record.best_e1rm_kg)}
          detail={formatDay(record.best_e1rm_on)}
        />
        <StatTile
          label="Peso máximo"
          value={formatKg(record.max_weight_kg)}
          detail={formatDay(record.max_weight_on)}
        />
        <StatTile
          className="col-span-2 sm:col-span-1"
          label="Sesiones"
          value={String(record.sessions)}
          detail={MUSCLE_GROUP_LABELS[record.muscle_group]}
        />
      </div>

      <section className="space-y-2">
        <h2 className="font-heading text-lg font-medium">Evolución por sesión</h2>
        <QueryStatus
          query={progress}
          loading={<ChartFallback />}
          error="No se pudo cargar la evolución del ejercicio."
        />
        {progress.data &&
          (sessions.length < 2 ? (
            <EmptyState>Con dos sesiones de este ejercicio verás su gráfica.</EmptyState>
          ) : (
            <Suspense fallback={<ChartFallback />}>
              <ExerciseChart sessions={sessions} forecast={progress.data.forecast} />
            </Suspense>
          ))}
        {progress.data?.forecast && <ForecastNote message={forecastMessage(progress.data.forecast)} />}
        {sessions.length > 0 && (
          <DataTable
            caption={`Sesiones de ${record.exercise_name}`}
            headers={['Fecha', 'e1RM', 'Peso máx.', 'Series', 'Reps']}
            rows={sessions
              .toReversed()
              .map((session) => [
                formatShortDay(session.performed_on),
                formatDecimal(session.best_e1rm_kg),
                formatDecimal(session.top_weight_kg),
                session.working_sets,
                session.total_reps,
              ])}
          />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-heading text-lg font-medium">Récords personales</h2>
        <ul className="bg-card divide-y rounded-xl border">
          {records.map((item) => (
            <li key={item.exercise_id}>
              <button
                type="button"
                aria-current={item.exercise_id === record.exercise_id ? true : undefined}
                className="hover:bg-muted aria-[current]:bg-muted/60 flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors first:rounded-t-xl last:rounded-b-xl"
                onClick={() => setSelectedId(item.exercise_id)}
              >
                <span className="min-w-0 truncate">{item.exercise_name}</span>
                <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
                  e1RM {formatKg(item.best_e1rm_kg)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function ForecastNote({ message }: { message: { title: string; detail: string } }) {
  return (
    <p className="bg-card ring-foreground/10 rounded-xl px-4 py-3 text-sm ring-1">
      <span className="block font-medium">{message.title}</span>
      <span className="text-muted-foreground block">{message.detail}</span>
    </p>
  )
}
