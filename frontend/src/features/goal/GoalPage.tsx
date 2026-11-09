import { ArrowDownIcon, ArrowDownUpIcon, ArrowUpIcon, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { QueryStatus } from '@/components/QueryStatus'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/features/auth/queries'
import { TRAINING_GOAL_LABELS } from '@/lib/labels'
import { rirRange } from '@/lib/rir'
import type { GoalPlan, TrainingGoal } from '@/lib/types'
import { cn } from '@/lib/utils'
import { BlockPicker } from './BlockPicker'
import { formatRange, formatRest } from './goal-format'
import { useGoalPlans, useUpdateGoal, type TrainingChanges } from './queries'

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

function PlanSummary({ plan, tip }: { plan: GoalPlan; tip: string }) {
  const items = [
    {
      label: 'Repeticiones',
      value: formatRange(plan.compound_reps),
      hint: `${formatRange(plan.isolation_reps)} en aislamiento`,
    },
    { label: 'Series por músculo', value: formatRange(plan.weekly_hard_sets), hint: 'a la semana' },
    { label: 'Intensidad', value: `RIR ${formatRange(rirRange(plan.rpe))}`, hint: 'reps en reserva' },
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

/**
 * How the user trains: the goal, whose plan previews what each choice means, and optionally the
 * training blocks that end in a deload week. One "Guardar" sends only what changed.
 */
export function GoalPage() {
  const currentUser = useCurrentUser().data
  const current = currentUser?.goal ?? null
  const currentBlock = currentUser?.block_weeks ?? null
  const plans = useGoalPlans()
  const updateGoal = useUpdateGoal()
  const navigate = useNavigate()
  const [picked, setPicked] = useState<TrainingGoal | null>(null)
  // Undefined until touched, as null is a choice of its own: no blocks.
  const [pickedBlock, setPickedBlock] = useState<number | null | undefined>(undefined)
  const selected = picked ?? current
  const selectedBlock = pickedBlock === undefined ? currentBlock : pickedBlock

  const plan = plans.data?.find((item) => item.goal === selected)
  const tip = GOALS.find((item) => item.goal === selected)?.tip ?? ''
  const changes: TrainingChanges = {
    ...(selected !== current && { goal: selected }),
    ...(selectedBlock !== currentBlock && { block_weeks: selectedBlock }),
  }
  const hasChanges = Object.keys(changes).length > 0

  const save = () => {
    if (selected === null || !hasChanges) return
    updateGoal.mutate(changes, {
      onSuccess: () => {
        toast.success(
          changes.goal !== undefined
            ? `Objetivo guardado: ${TRAINING_GOAL_LABELS[selected].title}`
            : 'Bloques guardados',
        )
        navigate('/')
      },
    })
  }

  const restartBlock = () => {
    if (currentBlock === null) return
    updateGoal.mutate(
      { block_weeks: currentBlock },
      { onSuccess: () => toast.success(`Bloque reiniciado: semana 1 de ${currentBlock}`) },
    )
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
          <BlockPicker
            value={selectedBlock}
            onChange={setPickedBlock}
            onRestart={currentBlock !== null && selectedBlock === currentBlock ? restartBlock : undefined}
            restarting={updateGoal.isPending}
          />
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
        disabled={selected === null || !hasChanges || updateGoal.isPending}
      >
        {updateGoal.isPending ? 'Guardando…' : 'Guardar objetivo'}
      </Button>
    </div>
  )
}
