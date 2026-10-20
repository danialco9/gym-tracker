import {
  ChartLineIcon,
  ChevronRightIcon,
  DumbbellIcon,
  FlameIcon,
  ScaleIcon,
  TargetIcon,
  TrendingUpIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import heroImage from '@/assets/hero-squat.webp'
import { QueryStatus } from '@/components/QueryStatus'
import { buttonVariants } from '@/components/ui/button'
import { useCurrentUser } from '@/features/auth/queries'
import { Achievements } from '@/features/home/Achievements'
import { GettingStarted } from '@/features/home/GettingStarted'
import { RankingCard } from '@/features/home/RankingCard'
import { useAchievements, useProgressOverview } from '@/features/progress/queries'
import { loadDraft } from '@/features/workout/draft'
import { PendingWorkouts } from '@/features/workout/PendingWorkouts'
import { useRecentWorkouts, useRoutines } from '@/features/workout/queries'
import { formatDate, formatDecimal, formatDuration, formatSignedKg, plural } from '@/lib/format'
import type { ProgressOverview, Workout } from '@/lib/types'
import { cn } from '@/lib/utils'

function workoutSummary(workout: Workout): string {
  const exerciseCount = new Set(workout.sets.map((set) => set.exercise_id)).size
  const setCount = workout.sets.length
  return [
    formatDuration(workout.started_at, workout.ended_at),
    `${exerciseCount} ${plural(exerciseCount, 'ejercicio', 'ejercicios')}`,
    `${setCount} ${plural(setCount, 'serie', 'series')}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof FlameIcon
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="bg-card ring-foreground/10 rounded-xl p-4 ring-1">
      <p className="eyebrow flex items-center gap-1.5">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </p>
      <p className="stat-number mt-2.5">{value}</p>
      {hint !== undefined && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
    </div>
  )
}

/** Kilos lifted in the most recent week the analytics engine reported. */
function weekVolumeKg(overview: ProgressOverview): number | null {
  const week = overview.weekly_volume.at(-1)
  return week === undefined ? null : week.muscles.reduce((total, muscle) => total + muscle.volume_kg, 0)
}

function Stats({ overview }: { overview: ProgressOverview }) {
  const workouts = overview.activity.workouts_last_7_days
  const volume = weekVolumeKg(overview)
  const lastWeight = overview.body_weight.entries.at(-1)
  const weeklyChange = overview.body_weight.weekly_change_kg

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        icon={FlameIcon}
        label="Esta semana"
        value={String(workouts)}
        hint={plural(workouts, 'entreno', 'entrenos')}
      />
      <Stat
        icon={TrendingUpIcon}
        label="Volumen"
        value={volume === null ? '—' : `${formatDecimal(Math.round(volume))}`}
        hint="kg levantados"
      />
      <Stat
        icon={DumbbellIcon}
        label="Ejercicios"
        value={String(overview.personal_records.length)}
        hint="con marcas registradas"
      />
      <Stat
        icon={ScaleIcon}
        label="Peso"
        value={lastWeight === undefined ? '—' : formatDecimal(lastWeight.weight_kg)}
        hint={weeklyChange === null ? 'kg' : `kg · ${formatSignedKg(weeklyChange)}/sem`}
      />
    </div>
  )
}

/** Until a goal is chosen the advice is the general one; this says it can be tailored. */
function GoalPrompt() {
  return (
    <Link
      to="/objetivo"
      className="bg-primary/10 ring-primary/40 hover:bg-primary/15 flex items-center justify-between gap-3 rounded-xl p-4 ring-1 transition-colors"
    >
      <span className="flex min-w-0 items-center gap-3">
        <TargetIcon className="text-primary size-5 shrink-0" aria-hidden />
        <span className="min-w-0">
          <span className="block font-medium">Elige tu objetivo</span>
          <span className="text-muted-foreground block text-sm">
            Bajar grasa, ganar músculo o recomposición
          </span>
        </span>
      </span>
      <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
    </Link>
  )
}

function NextSession({ overview }: { overview: ProgressOverview }) {
  const recommendations = overview.recommendations
  if (recommendations.length === 0) {
    return null
  }
  const count = (action: string) => recommendations.filter((item) => item.action === action).length
  const increases = count('increase_load')
  const deloads = count('deload')
  const summary = [
    `${increases} ${plural(increases, 'ejercicio listo', 'ejercicios listos')} para subir peso`,
    deloads > 0 && `${deloads} ${plural(deloads, 'descarga', 'descargas')}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Link
      to="/progreso"
      className="bg-card ring-foreground/10 hover:bg-accent flex items-center justify-between gap-3 rounded-xl p-4 ring-1 transition-colors"
    >
      <span className="flex min-w-0 items-center gap-3">
        <ChartLineIcon className="text-primary size-5 shrink-0" aria-hidden />
        <span className="min-w-0">
          <span className="block font-medium">Próxima sesión</span>
          <span className="text-muted-foreground block text-sm">{summary}</span>
        </span>
      </span>
      <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
    </Link>
  )
}

export function HomePage() {
  const [hasDraft] = useState(() => loadDraft() !== null)
  const currentUser = useCurrentUser().data
  const workouts = useRecentWorkouts(5)
  const routines = useRoutines()
  const overview = useProgressOverview()
  const achievements = useAchievements()
  const routineNames = new Map(routines.data?.map((routine) => [routine.id, routine.name]))

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl">
        <img
          src={heroImage}
          alt=""
          className="absolute inset-0 size-full object-cover"
          fetchPriority="high"
          aria-hidden
        />
        <div className="photo-scrim" />
        <div className="relative flex flex-col gap-5 p-6 sm:p-8 lg:min-h-64 lg:justify-end">
          <div className="space-y-2">
            <p className="eyebrow text-white/70">Gym Tracker</p>
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
              Tu entrenamiento, medido
            </h1>
            <p className="max-w-md text-sm text-white/80">
              Registra cada serie y decide con datos cuándo progresar.
            </p>
          </div>
          <Link
            to="/entrenar"
            className={cn(
              buttonVariants({ size: 'lg' }),
              'h-12 w-full text-base sm:w-auto sm:self-start sm:px-8',
            )}
          >
            <DumbbellIcon />
            {hasDraft ? 'Continuar entreno' : 'Empezar entreno'}
          </Link>
        </div>
      </section>

      <PendingWorkouts />

      {currentUser != null && currentUser.goal === null && <GoalPrompt />}

      {routines.data !== undefined && workouts.data !== undefined && (
        <GettingStarted
          hasRoutine={routines.data.length > 0}
          hasWorkout={workouts.data.length > 0}
          hasWeight={(overview.data?.body_weight.entries.length ?? 0) > 0}
        />
      )}

      {currentUser != null && achievements.data !== undefined && (
        <Achievements userId={currentUser.id} achievements={achievements.data} />
      )}

      {currentUser != null && <RankingCard user={currentUser} />}

      {overview.data !== undefined && (
        <section className="space-y-3">
          <Stats overview={overview.data} />
          <NextSession overview={overview.data} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="eyebrow">Últimos entrenos</h2>
        <QueryStatus query={workouts} loading="Cargando…" error="No se pudieron cargar tus entrenos." />
        {workouts.data?.length === 0 && (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            Todavía no has registrado ningún entreno.
          </p>
        )}
        <ul className="grid gap-2 lg:grid-cols-2">
          {workouts.data?.map((workout) => (
            <li
              key={workout.id}
              className="bg-card ring-foreground/10 flex min-w-0 items-center gap-3 rounded-xl p-4 ring-1"
            >
              <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                <DumbbellIcon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {workout.routine_id === null
                    ? 'Entreno libre'
                    : (routineNames.get(workout.routine_id) ?? 'Rutina')}
                </span>
                <span className="text-muted-foreground block text-sm">
                  {formatDate(workout.started_at)} · {workoutSummary(workout)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
