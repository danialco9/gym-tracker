import { ChartLineIcon, ChevronRightIcon, DumbbellIcon, TargetIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import heroImage from '@/assets/hero-squat.webp'
import { QueryStatus } from '@/components/QueryStatus'
import { buttonVariants } from '@/components/ui/button'
import { useCurrentUser } from '@/features/auth/queries'
import { GettingStarted } from '@/features/home/GettingStarted'
import { OverloadCard } from '@/features/home/OverloadCard'
import { RankingCard } from '@/features/home/RankingCard'
import { StreakCard } from '@/features/home/StreakCard'
import { useProgressOverview, useStreak } from '@/features/progress/queries'
import { loadDraft } from '@/features/workout/draft'
import { PendingWorkouts } from '@/features/workout/PendingWorkouts'
import { useRecentWorkouts, useRoutines } from '@/features/workout/queries'
import { formatDate, formatDuration, plural } from '@/lib/format'
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
  const streak = useStreak()
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
        {/* The user is already sold: a greeting and the one action, not a tagline. */}
        <div className="relative flex flex-col gap-4 p-5 sm:p-8 lg:min-h-48 lg:justify-end">
          <h1 className="font-heading truncate text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {currentUser?.nickname ? `Hola, ${currentUser.nickname}` : 'Hola'}
          </h1>
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

      {streak.data !== undefined && (
        <StreakCard streak={streak.data} workoutsThisWeek={overview.data?.activity.workouts_last_7_days} />
      )}

      {overview.data !== undefined && <OverloadCard exercises={overview.data.week_overload} />}

      {currentUser != null && <RankingCard user={currentUser} />}

      {overview.data !== undefined && <NextSession overview={overview.data} />}

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
