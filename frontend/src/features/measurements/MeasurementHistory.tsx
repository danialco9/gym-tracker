import { ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDay, formatDecimal, formatKg, formatSignedKg } from '@/lib/format'
import type { BodyMeasurement } from '@/lib/types'
import { measurementToForm, OPTIONAL_FIELDS, withWeightChanges } from './measurement-form'

function extraSummary(measurement: BodyMeasurement): string {
  const values = measurementToForm(measurement)
  return OPTIONAL_FIELDS.flatMap(({ key, shortLabel, unit }) => {
    const value = values[key]
    return value === null ? [] : [`${shortLabel} ${formatDecimal(value)} ${unit}`]
  }).join(' · ')
}

interface MeasurementHistoryProps {
  /** Oldest first, as the API returns them. */
  measurements: BodyMeasurement[]
  onSelect: (measurement: BodyMeasurement) => void
}

/** Enough to see the last couple of weeks; the rest is one tap away. */
const VISIBLE_AT_FIRST = 10

export function MeasurementHistory({ measurements, onSelect }: MeasurementHistoryProps) {
  const [showAll, setShowAll] = useState(false)
  const newestFirst = withWeightChanges(measurements).toReversed()
  const visible = showAll ? newestFirst : newestFirst.slice(0, VISIBLE_AT_FIRST)
  const hidden = newestFirst.length - visible.length

  return (
    <div className="space-y-2">
      <ul className="bg-card divide-y overflow-hidden rounded-xl border">
        {visible.map(({ measurement, change }) => {
          const extra = extraSummary(measurement)
          return (
            <li key={measurement.id}>
              <button
                type="button"
                className="hover:bg-muted flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors"
                onClick={() => onSelect(measurement)}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="flex items-baseline gap-2">
                      <span className="font-medium tabular-nums">
                        {measurement.weight_kg === null ? 'Sin peso' : formatKg(measurement.weight_kg)}
                      </span>
                      {change !== null && (
                        <span className="text-muted-foreground text-sm tabular-nums">
                          {formatSignedKg(change)}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-sm whitespace-nowrap">
                      {formatDay(measurement.measured_on)}
                    </span>
                  </span>
                  {extra && <span className="text-muted-foreground block truncate text-xs">{extra}</span>}
                </span>
                <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>
      {hidden > 0 && (
        <Button type="button" variant="ghost" className="w-full" onClick={() => setShowAll(true)}>
          Ver todas ({newestFirst.length})
        </Button>
      )}
    </div>
  )
}
