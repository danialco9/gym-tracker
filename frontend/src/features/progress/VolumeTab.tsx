import { lazy, Suspense } from 'react'
import { formatDecimal } from '@/lib/format'
import { MUSCLE_GROUP_LABELS } from '@/lib/labels'
import type { MuscleWeek, WeeklyVolume } from '@/lib/types'
import { ChartFallback, EmptyState } from './ProgressParts'
import { buildVolume } from './progress-data'
import { WeekVolumeBody } from './WeekVolumeBody'

const VolumeChart = lazy(() => import('./ProgressCharts').then((module) => ({ default: module.VolumeChart })))

export function VolumeTab({ weeks, weekSets }: { weeks: WeeklyVolume[]; weekSets: MuscleWeek[] }) {
  const { series, rows, comparison } = buildVolume(weeks)

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

      <section className="space-y-2">
        <h2 className="font-heading text-lg font-medium">Esta semana</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <caption className="sr-only">Series por músculo esta semana y media de las 4 anteriores</caption>
            <thead className="text-muted-foreground text-xs">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Músculo
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Esta semana
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Media 4 semanas
                </th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.muscle} className="border-t">
                  <th scope="row" className="py-1.5 pr-3 font-normal">
                    {MUSCLE_GROUP_LABELS[row.muscle]}
                  </th>
                  <td className="py-1.5 pr-3 text-right font-medium">{row.currentWeek}</td>
                  <td className="text-muted-foreground py-1.5 text-right">
                    {formatDecimal(row.previousAverage)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
