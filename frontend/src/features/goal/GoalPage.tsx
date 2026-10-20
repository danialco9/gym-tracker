import { ArrowDownIcon, ArrowDownUpIcon, ArrowUpIcon, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { QueryStatus } from '@/components/QueryStatus'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/features/auth/queries'
import { formatDecimal } from '@/lib/format'
import { TRAINING_GOAL_LABELS } from '@/lib/labels'
import type { GoalPlan, TrainingGoal } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useGoalPlans, useUpdateGoal } from './queries'

const GOALS: { goal: TrainingGoal; icon: LucideIcon; tip: string }[] = [
  {
    goal: 'lose_fat',
    icon: ArrowDownIcon,
    tip: 'Mantén pesos altos para conservar el músculo y suma pasos o cardio suave.',
  },
  {
    goal: 'build_muscle',
    icon: ArrowUpIcon,
    tip: 'Cuando completes todas las series en lo alto del rango, toca subir peso.',
  },
  {
    goal: 'recomposition',
    icon: ArrowDownUpIcon,
    tip: 'Básicos pesados y accesorios más ligeros. Mira la cintura, no solo la báscula.',
  },
]

const range = (min: string, max: string) => (min === max ? min : `${min}–${max}`)

function formatRest({ min, max }: GoalPlan['rest_seconds']): string {
  if (min % 60 === 0 && max % 60 === 0) {
    return `${range(String(min / 60), String(max / 60))} min`
  }
  return `${range(String(min), String(max))} s`
}

function PlanSummary({ plan, tip }: { plan: GoalPlan; tip: string }) {
  const items = [
    {
      label: 'Repeticiones',
      value: range(String(plan.compound_reps.min), String(plan.compound_reps.max)),
      hint: `${range(String(plan.isolation_reps.min), String(plan.isolation_reps.max))} en aislamiento`,
    },
    {
      label: 'Series por músculo',
      value: range(String(plan.weekly_hard_sets.min), String(plan.weekly_hard_sets.max)),
      hint: 'a la semana',
    },
    {
      label: 'Intensidad',
      value: `RPE ${range(formatDecimal(plan.rpe.min), formatDecimal(plan.rpe.max))}`,
      hint: 'esfuerzo de 1 a 10',
    },
    { label: 'Descanso', value: formatRest(plan.rest_seconds), hint: 'entre series' },
  ]
  return (
    <section
      aria-labelledby="goal-plan"
      className="bg-card ring-foreground/10 space-y-4 rounded-xl p-4 ring-1"
    >
      <h2 id="goal-plan" className="text-muted-foreground text-sm">
        Así entrenarás
      </h2>
      <dl className="grid grid-cols-2 gap-4">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-muted-foreground text-xs">{item.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{item.value}</dd>
            <dd className="text-muted-foreground text-xs">{item.hint}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t pt-3 text-sm">{tip}</p>
    </section>
  )
}

/** One decision: what the user trains for. The plan below previews what each choice means. */
export function GoalPage() {
  const current = useCurrentUser().data?.goal ?? null
  const plans = useGoalPlans()
  const updateGoal = useUpdateGoal()
  const navigate = useNavigate()
  const [picked, setPicked] = useState<TrainingGoal | null>(null)
  const selected = picked ?? current

  const plan = plans.data?.find((item) => item.goal === selected)
  const tip = GOALS.find((item) => item.goal === selected)?.tip ?? ''

  const save = () => {
    if (selected === null) return
    updateGoal.mutate(selected, {
      onSuccess: () => {
        toast.success(`Objetivo guardado: ${TRAINING_GOAL_LABELS[selected].title}`)
        navigate('/')
      },
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Objetivo"
        title="¿Cuál es tu objetivo?"
        description="Ajustamos series, repeticiones y descansos a lo que elijas. Puedes cambiarlo cuando quieras."
      />

      <div className="grid gap-2">
        {GOALS.map(({ goal, icon: Icon }) => {
          const isSelected = goal === selected
          return (
            <button
              key={goal}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setPicked(goal)}
              className={cn(
                'flex min-h-18 w-full items-center gap-3 rounded-xl p-3 text-left ring-2 transition-colors',
                isSelected ? 'bg-primary/10 ring-primary' : 'bg-card hover:bg-accent ring-transparent',
              )}
            >
              <span
                className={cn(
                  'flex size-11 shrink-0 items-center justify-center rounded-lg',
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground',
                )}
                aria-hidden
              >
                <Icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{TRAINING_GOAL_LABELS[goal].title}</span>
                <span className="text-muted-foreground block text-sm">{TRAINING_GOAL_LABELS[goal].hint}</span>
              </span>
            </button>
          )
        })}
      </div>

      {selected !== null && (
        <>
          <QueryStatus query={plans} loading="Cargando tu plan…" error="No se pudo cargar el plan." />
          {plan !== undefined && <PlanSummary plan={plan} tip={tip} />}
        </>
      )}

      {updateGoal.isError && (
        <Alert variant="destructive">
          <AlertDescription>No se pudo guardar. Prueba otra vez en un rato.</AlertDescription>
        </Alert>
      )}

      <Button
        size="lg"
        className="h-12 w-full text-base"
        onClick={save}
        disabled={selected === null || selected === current || updateGoal.isPending}
      >
        {updateGoal.isPending ? 'Guardando…' : 'Guardar objetivo'}
      </Button>
    </div>
  )
}
