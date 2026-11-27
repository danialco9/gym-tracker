import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDate, formatDay, formatDecimal, formatKg, formatShortDate, formatShortDay } from '@/lib/format'
import type { ExerciseForecast, ExerciseSession, ProgressOverview } from '@/lib/types'
import { roundKgTicks } from './chart-axis'
import { exerciseChartRows } from './forecast'
import {
  muscleLabel,
  OTHER_MUSCLES,
  seriesColor,
  type VolumeRow,
  type VolumeSeriesKey,
} from './progress-data'

// Charts are loaded lazily with the progress page so Recharts stays out of the main bundle.

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 12 }
const TOOLTIP_STYLE = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--popover-foreground)',
  fontSize: 13,
}
const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: -12 }

const volumeColor = (key: VolumeSeriesKey, index: number) =>
  key === OTHER_MUSCLES ? 'var(--chart-other)' : seriesColor(index)

interface LegendItem {
  label: string
  color: string
  shape?: 'line' | 'dashed' | 'dot' | 'square'
}

/** Identity for multi-series charts: a coloured key beside text in the normal text colour. */
function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map(({ label, color, shape = 'square' }) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={
              shape === 'line' || shape === 'dashed'
                ? 'h-0.5 w-4 rounded-full'
                : shape === 'dot'
                  ? 'size-2 rounded-full'
                  : 'size-2.5 rounded-sm'
            }
            style={
              shape === 'dashed'
                ? { background: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` }
                : { background: color }
            }
          />
          {label}
        </li>
      ))}
    </ul>
  )
}

const kgAxis = (value: number) => formatDecimal(Math.round(value))
/** The Y axis of a kilo chart: round ticks, and the domain they span. */
const kgYAxis = (values: (number | undefined)[], padding: number) => {
  const ticks = roundKgTicks(
    values.filter((value) => value !== undefined),
    padding,
  )
  return ticks.length > 0 ? { ticks, domain: [ticks[0]!, ticks[ticks.length - 1]!] } : {}
}

const shortDay = (day: unknown) => formatShortDate(new Date(Number(day)).toISOString())
const longDay = (day: unknown) => formatDate(new Date(Number(day)).toISOString())

export function ExerciseChart({
  sessions,
  forecast,
}: {
  sessions: ExerciseSession[]
  forecast: ExerciseForecast | null
}) {
  const rows = exerciseChartRows(sessions, forecast)
  const yAxis = kgYAxis(
    rows.flatMap((row) => [row.best_e1rm_kg, row.top_weight_kg, row.forecast_kg]),
    2,
  )
  return (
    <div className="space-y-2">
      <div className="h-56 w-full">
        <ResponsiveContainer>
          <LineChart data={rows} margin={CHART_MARGIN}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            {/* By date, not by session: a month ahead looks like a month. */}
            <XAxis
              dataKey="day"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={shortDay}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tick={AXIS_TICK}
            />
            <YAxis
              {...yAxis}
              tickFormatter={kgAxis}
              tickLine={false}
              axisLine={false}
              width={48}
              tick={AXIS_TICK}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={longDay}
              formatter={(value, name) => [formatKg(Number(value)), name]}
            />
            <Line
              name="Tendencia"
              dataKey="forecast_kg"
              stroke={seriesColor(0)}
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeOpacity={0.7}
              dot={false}
              activeDot={false}
              connectNulls
            />
            <Line
              name="e1RM estimado"
              dataKey="best_e1rm_kg"
              connectNulls
              stroke={seriesColor(0)}
              strokeWidth={2}
              dot={{ r: 4, fill: seriesColor(0), stroke: 'var(--background)', strokeWidth: 2 }}
              activeDot={{ r: 5 }}
            />
            <Line
              name="Peso máximo"
              dataKey="top_weight_kg"
              connectNulls
              stroke={seriesColor(1)}
              strokeWidth={2}
              dot={{ r: 4, fill: seriesColor(1), stroke: 'var(--background)', strokeWidth: 2 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        items={[
          { label: 'e1RM estimado', color: seriesColor(0), shape: 'line' },
          { label: 'Peso máximo', color: seriesColor(1), shape: 'line' },
          ...(forecast === null
            ? []
            : [{ label: 'Tendencia', color: seriesColor(0), shape: 'dashed' as const }]),
        ]}
      />
    </div>
  )
}

interface VolumeChartProps {
  rows: VolumeRow[]
  series: VolumeSeriesKey[]
}

export function VolumeChart({ rows, series }: VolumeChartProps) {
  return (
    <div className="space-y-2">
      <div className="h-56 w-full">
        <ResponsiveContainer>
          <BarChart data={rows} margin={CHART_MARGIN} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="week_start"
              tickFormatter={formatShortDay}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} tick={AXIS_TICK} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
              labelFormatter={(label) => `Semana del ${formatDay(String(label))}`}
              formatter={(value, name) => [`${String(value)} series`, name]}
            />
            {series.map((key, index) => (
              <Bar
                key={key}
                name={muscleLabel(key)}
                dataKey={key}
                stackId="sets"
                fill={volumeColor(key, index)}
                stroke="var(--background)"
                strokeWidth={2}
                maxBarSize={24}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        items={series.map((key, index) => ({ label: muscleLabel(key), color: volumeColor(key, index) }))}
      />
    </div>
  )
}

export function BodyWeightChart({ entries }: { entries: ProgressOverview['body_weight']['entries'] }) {
  const yAxis = kgYAxis(
    entries.flatMap((entry) => [entry.weight_kg, entry.trend_kg]),
    0.5,
  )
  return (
    <div className="space-y-2">
      <div className="h-56 w-full">
        <ResponsiveContainer>
          <ComposedChart data={entries} margin={CHART_MARGIN}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="measured_on"
              tickFormatter={formatShortDay}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tick={AXIS_TICK}
            />
            <YAxis
              {...yAxis}
              tickFormatter={kgAxis}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={48}
              tick={AXIS_TICK}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(label) => formatDay(String(label))}
              formatter={(value, name) => [formatKg(Number(value)), name]}
            />
            {/* Drawn at once: animating a dot per weigh-in redraws the chart every frame, which kept a
                phone busy for seconds when Medidas opened. */}
            <Scatter
              name="Pesaje"
              dataKey="weight_kg"
              fill={seriesColor(0)}
              fillOpacity={0.45}
              isAnimationActive={false}
            />
            <Line
              name="Media 7 días"
              dataKey="trend_kg"
              stroke={seriesColor(0)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        items={[
          { label: 'Pesaje', color: seriesColor(0), shape: 'dot' },
          { label: 'Media 7 días', color: seriesColor(0), shape: 'line' },
        ]}
      />
    </div>
  )
}
