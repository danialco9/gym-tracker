import { useSearchParams } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { QueryStatus } from '@/components/QueryStatus'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDay, formatSignedKg } from '@/lib/format'
import { BodyWeightTab } from './BodyWeightTab'
import { ExercisesTab } from './ExercisesTab'
import { StatTile } from './ProgressParts'
import { useProgressOverview } from './queries'
import { RecommendationsTab } from './RecommendationsTab'
import { VolumeTab } from './VolumeTab'

const TABS = [
  { value: 'proxima', label: 'Próxima' },
  { value: 'ejercicios', label: 'Ejercicios' },
  { value: 'volumen', label: 'Volumen' },
  { value: 'peso', label: 'Peso' },
] as const

type TabValue = (typeof TABS)[number]['value']

const isTab = (value: unknown): value is TabValue => TABS.some((tab) => tab.value === value)

export function ProgressPage() {
  const overview = useProgressOverview()
  // The active tab lives in the URL (?vista=), so reloads and the back button keep it.
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('vista')
  const tab: TabValue = isTab(requested) ? requested : 'proxima'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Análisis"
        title="Progreso"
        description="Qué toca en la próxima sesión y cómo evolucionas."
      />

      <QueryStatus
        query={overview}
        loading="Calculando tu progreso…"
        error="No se pudo cargar tu progreso."
      />

      {overview.data && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            <StatTile
              label="Últimos 7 días"
              value={String(overview.data.activity.workouts_last_7_days)}
              detail="entrenos"
            />
            <StatTile
              label="Últimos 28 días"
              value={String(overview.data.activity.workouts_last_28_days)}
              detail="entrenos"
            />
            <StatTile
              className="col-span-2 sm:col-span-1"
              label="Último entreno"
              value={
                overview.data.activity.last_workout_on === null
                  ? '—'
                  : formatDay(overview.data.activity.last_workout_on)
              }
              detail={
                overview.data.body_weight.weekly_change_kg === null
                  ? undefined
                  : `Peso ${formatSignedKg(overview.data.body_weight.weekly_change_kg)}/sem`
              }
            />
          </div>

          <Tabs
            value={tab}
            onValueChange={(value) => {
              if (isTab(value)) {
                setSearchParams({ vista: value }, { replace: true })
              }
            }}
          >
            <TabsList className="h-10 w-full lg:w-auto">
              {TABS.map(({ value, label }) => (
                <TabsTrigger key={value} value={value}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="proxima" className="pt-2">
              <RecommendationsTab
                recommendations={overview.data.recommendations}
                volumeAdvice={overview.data.volume_advice}
                hasWorkouts={overview.data.activity.workouts_total > 0}
              />
            </TabsContent>
            <TabsContent value="ejercicios" className="pt-2">
              <ExercisesTab records={overview.data.personal_records} />
            </TabsContent>
            <TabsContent value="volumen" className="pt-2">
              <VolumeTab weeks={overview.data.weekly_volume} weekSets={overview.data.week_sets} />
            </TabsContent>
            <TabsContent value="peso" className="pt-2">
              <BodyWeightTab bodyWeight={overview.data.body_weight} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
