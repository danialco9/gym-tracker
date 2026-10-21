import { ChevronLeftIcon, ListChecksIcon, PlayIcon, TargetIcon } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { QueryStatus } from '@/components/QueryStatus'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/features/auth/queries'
import { goalSummary } from '@/features/goal/goal-format'
import { useGoalPlans } from '@/features/goal/queries'
import {
  ACTION_ICONS,
  ACTION_TITLES,
  explainRecommendation,
  explainVolume,
} from '@/features/progress/progress-data'
import { useProgressOverview } from '@/features/progress/queries'
import { MUSCLE_GROUP_LABELS } from '@/lib/labels'
import { formatSetPlan } from '@/lib/set-plan'
import type { PlannedSet, Recommendation, Routine, RoutineExercise } from '@/lib/types'
import { cn } from '@/lib/utils'

const toPlan = (sets: PlannedSet[]) => sets.map((set) => ({ reps: set.reps, weightKg: set.weight_kg }))

function PlanRow({ item, recommendation }: { item: RoutineExercise; recommendation?: Recommendation }) {
  const Icon = recommendation === undefined ? ListChecksIcon : ACTION_ICONS[recommendation.action]
  const plan =
    recommendation === undefined
      ? formatSetPlan(item.sets.map((set) => ({ reps: set.target_reps, weightKg: set.target_weight_kg })))
      : formatSetPlan(toPlan(recommendation.suggested_sets))
  return (
    <li className="flex gap-3 py-3">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          recommendation === undefined
            ? 'bg-secondary text-secondary-foreground'
            : 'bg-primary/10 text-primary',
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 space-y-0.5">
        <span className="block font-medium">{item.exercise.name}</span>
        <span className="text-muted-foreground block text-xs">
          {recommendation === undefined ? 'Según tu rutina' : ACTION_TITLES[recommendation.action]}
        </span>
        {plan !== null && <span className="block text-sm font-semibold tabular-nums">{plan}</span>}
        {recommendation !== undefined && (
          <span className="text-muted-foreground block text-xs">{explainRecommendation(recommendation)}</span>
        )}
      </span>
    </li>
  )
}

interface DailyPlanProps {
  routine: Routine
  /** Starts the workout with today's suggested sets per exercise id. */
  onStart: (suggestions: ReadonlyMap<number, PlannedSet[]>) => void
  onBack: () => void
}

/**
 * Today's session for a routine before it starts: what to do with each exercise according to the
 * last workouts, and how the week's volume of its muscles compares to the goal. Never blocks the
 * start: while the analysis loads (or if it fails), the routine's own plan is there.
 */
export function DailyPlan({ routine, onStart, onBack }: DailyPlanProps) {
  const goal = useCurrentUser().data?.goal ?? null
  const goalPlan = useGoalPlans().data?.find((plan) => plan.goal === goal)
  const overview = useProgressOverview()

  const recommendations = new Map(
    overview.data?.recommendations.map((item) => [item.exercise_id, item] as const),
  )
  const muscles = new Set(routine.exercises.map((item) => item.exercise.muscle_group))
  const volume = overview.data?.volume_advice.filter((advice) => muscles.has(advice.muscle_group)) ?? []

  const start = () => {
    const suggestions = new Map<number, PlannedSet[]>()
    for (const item of routine.exercises) {
      const recommendation = recommendations.get(item.exercise.id)
      if (recommendation !== undefined) {
        suggestions.set(item.exercise.id, recommendation.suggested_sets)
      }
    }
    onStart(suggestions)
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="text-muted-foreground hover:text-foreground -mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeftIcon className="size-4" aria-hidden />
        Volver
      </button>

      <PageHeader
        eyebrow="Plan de hoy"
        title={routine.name}
        description={
          goalPlan === undefined ? 'Consejos generales según tus últimos entrenos.' : goalSummary(goalPlan)
        }
      />

      {goal === null && (
        <Link
          to="/objetivo"
          className="text-primary flex items-center gap-2 text-sm font-medium underline-offset-4 hover:underline"
        >
          <TargetIcon className="size-4" aria-hidden />
          Elige tu objetivo para afinar el plan
        </Link>
      )}

      <QueryStatus
        query={overview}
        loading="Preparando el plan…"
        error="No se pudo preparar el plan. Puedes empezar con tu rutina tal cual."
      />

      {routine.exercises.length === 0 ? (
        <p className="text-muted-foreground text-sm">Esta rutina aún no tiene ejercicios.</p>
      ) : (
        <ul
          aria-label="Ejercicios de hoy"
          className="bg-card ring-foreground/10 divide-y rounded-xl px-4 ring-1"
        >
          {routine.exercises.map((item) => (
            <PlanRow key={item.id} item={item} recommendation={recommendations.get(item.exercise.id)} />
          ))}
        </ul>
      )}

      {volume.length > 0 && (
        <section
          aria-labelledby="plan-volume"
          className="bg-card ring-foreground/10 space-y-2 rounded-xl p-4 ring-1"
        >
          <h2 id="plan-volume" className="font-medium">
            Volumen semanal
          </h2>
          <p className="text-muted-foreground text-xs">
            Media de tus últimas {volume[0].weeks} semanas completas. Lo recomendado son{' '}
            {volume[0].min_hard_sets}–{volume[0].max_hard_sets} series duras por músculo.
          </p>
          <ul className="space-y-1 text-sm">
            {volume.map((advice) => (
              <li key={advice.muscle_group}>
                <span className="font-medium">{MUSCLE_GROUP_LABELS[advice.muscle_group]}:</span>{' '}
                <span className="text-muted-foreground">{explainVolume(advice)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Fixed just above the bottom nav (the layout's bottom padding leaves room for it), so starting
          is always one tap away; from lg up, with the sidebar, it sticks to the bottom of the content. */}
      <div className="bg-background/95 fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t px-4 py-3 backdrop-blur lg:sticky lg:bottom-0 lg:-mx-2 lg:px-2">
        <Button
          size="lg"
          className="mx-auto flex h-14 w-full max-w-2xl text-base font-semibold"
          onClick={start}
        >
          <PlayIcon className="fill-current" aria-hidden />
          Empezar con este plan
        </Button>
      </div>
    </div>
  )
}
