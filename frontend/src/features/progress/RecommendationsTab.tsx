import { GaugeIcon } from 'lucide-react'
import { formatDay } from '@/lib/format'
import { MUSCLE_GROUP_LABELS } from '@/lib/labels'
import { formatSetPlan } from '@/lib/set-plan'
import type { Recommendation, VolumeAdvice } from '@/lib/types'
import { EmptyState } from './ProgressParts'
import {
  ACTION_ICONS,
  ACTION_TITLES,
  explainRecommendation,
  explainVolume,
  groupRecommendations,
} from './progress-data'

const toPlan = (sets: { reps: number | null; weight_kg: number | null }[]) =>
  sets.map((set) => ({ reps: set.reps, weightKg: set.weight_kg }))

function RecommendationRow({ item }: { item: Recommendation }) {
  const target = formatSetPlan(toPlan(item.target_sets))
  return (
    <li className="space-y-1 py-2.5">
      <p className="font-medium">{item.exercise_name}</p>
      <p className="text-muted-foreground text-xs tabular-nums">
        {formatDay(item.last_performed_on)}: {formatSetPlan(toPlan(item.last_sets))}
        {target && ` · objetivo ${target}`}
      </p>
      <p className="text-sm tabular-nums">
        <span className="text-muted-foreground">Próxima: </span>
        <span className="font-semibold">{formatSetPlan(toPlan(item.suggested_sets))}</span>
      </p>
      <p className="text-muted-foreground text-xs">{explainRecommendation(item)}</p>
    </li>
  )
}

function VolumeSection({ advice }: { advice: VolumeAdvice[] }) {
  const { weeks, min_hard_sets: min, max_hard_sets: max } = advice[0]
  return (
    <section aria-labelledby="volume-advice" className="bg-card rounded-xl border px-4 pt-3 pb-1">
      <h2 id="volume-advice" className="flex items-center gap-2 font-medium">
        <GaugeIcon className="text-primary size-4" aria-hidden />
        Volumen semanal
      </h2>
      <p className="text-muted-foreground text-xs">
        Media de tus últimas {weeks} semanas completas. Lo recomendado son {min}–{max} series duras por
        músculo.
      </p>
      <ul className="divide-y">
        {advice.map((item) => (
          <li key={item.muscle_group} className="space-y-0.5 py-2.5">
            <p className="font-medium">{MUSCLE_GROUP_LABELS[item.muscle_group]}</p>
            <p className="text-muted-foreground text-xs tabular-nums">{explainVolume(item)}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

interface RecommendationsTabProps {
  recommendations: Recommendation[]
  volumeAdvice: VolumeAdvice[]
  /** Whether any workout was ever logged: only the last four weeks get recommendations. */
  hasWorkouts: boolean
}

export function RecommendationsTab({ recommendations, volumeAdvice, hasWorkouts }: RecommendationsTabProps) {
  return (
    <div className="space-y-4">
      {recommendations.length === 0 ? (
        <EmptyState>
          {hasWorkouts
            ? 'No has entrenado en las últimas 4 semanas. Con tu próximo entreno verás aquí qué toca en la siguiente sesión.'
            : 'Registra tu primer entreno para recibir recomendaciones para la próxima sesión.'}
        </EmptyState>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            Según tu última sesión de cada ejercicio de las últimas 4 semanas, su objetivo en la rutina y el
            RPE.
          </p>
          {groupRecommendations(recommendations).map(({ action, items }) => {
            const Icon = ACTION_ICONS[action]
            return (
              <section key={action} className="bg-card rounded-xl border px-4 pt-3 pb-1">
                <h2 className="flex items-center gap-2 font-medium">
                  <Icon className="text-primary size-4" aria-hidden />
                  {ACTION_TITLES[action]}
                  <span className="text-muted-foreground text-sm font-normal">({items.length})</span>
                </h2>
                <ul className="divide-y">
                  {items.map((item) => (
                    <RecommendationRow key={item.exercise_id} item={item} />
                  ))}
                </ul>
              </section>
            )
          })}
        </>
      )}
      {volumeAdvice.length > 0 && <VolumeSection advice={volumeAdvice} />}
    </div>
  )
}
