import { lazy, Suspense } from 'react'
import type { MuscleWeek, WeeklyVolume } from '@/lib/types'
import { ChartFallback, EmptyState } from './ProgressParts'
import { buildVolume } from './progress-data'
import { WeekVolumeBody } from './WeekVolumeBody'

const VolumeChart = lazy(() => import('./ProgressCharts').then((module) => ({ default: module.VolumeChart })))

// This week's count per muscle is the body's alone: it counts secondary muscles as half a set, so a
// second table of primary-only counts would show another number for the same muscle.
export function VolumeTab({ weeks, weekSets }: { weeks: WeeklyVolume[]; weekSets: MuscleWeek[] }) {
  const { series, rows } = buildVolume(weeks)

  if (series.length === 0) {
    return (
      <div className="space-y-5">
        <WeekVolumeBody muscles={weekSets} />
        <EmptyState>Aún no hay series registradas en las últimas 8 semanas.</EmptyState>
      </div>
    )
  }
  return (
    <div className="space-y-5">
      <WeekVolumeBody muscles={weekSets} />

      <section className="space-y-2">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-medium">Series efectivas por semana</h2>
          <p className="text-muted-foreground text-sm">
            Series sin calentamiento, por grupo muscular principal. La última semana está en curso.
          </p>
        </div>
        <Suspense fallback={<ChartFallback />}>
          <VolumeChart rows={rows} series={series} />
        </Suspense>
      </section>
    </div>
  )
}
