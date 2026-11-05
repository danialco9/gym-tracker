import { ArrowLeftIcon, CheckIcon, PlusIcon, Trash2Icon, TrendingUpIcon, TrophyIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDecimal } from '@/lib/format'
import { cn } from '@/lib/utils'
import { WEIGHT_STEP_KG, type DraftSet } from './draft'
import type { LastTimeComparison } from './last-time'
import { Stepper } from './Stepper'

const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]

interface ActiveSetProps {
  number: number
  set: DraftSet
  canGoBack: boolean
  /** The reps and weight entered would beat the exercise's best estimated 1RM. */
  isRecord: boolean
  /** The same set last session; null for a warm-up or an exercise without history. */
  lastTime: LastTimeComparison | null
  onAdjust: (field: 'reps' | 'weightKg', delta: number) => void
  onChange: (changes: Partial<Pick<DraftSet, 'reps' | 'weightKg' | 'rpe'>>) => void
  onDone: () => void
  onBack: () => void
  onRemove: () => void
}

/**
 * The only set with controls: you fill it in, press "Hecho" and the next one opens. Everything
 * already logged sits above as a summary line, so the gym floor screen holds one decision at a time.
 */
export function ActiveSet({
  number,
  set,
  canGoBack,
  isRecord,
  lastTime,
  onAdjust,
  onChange,
  onDone,
  onBack,
  onRemove,
}: ActiveSetProps) {
  const rpeLabelId = useId()
  // Opened already when the set carries an effort, e.g. coming back to correct it.
  const [rpeOpen, setRpeOpen] = useState(set.rpe !== null)

  return (
    <div className="border-primary/50 bg-primary/5 space-y-3 rounded-lg border p-2">
      <div className="flex items-center justify-between">
        <span className="eyebrow text-foreground">Serie {number}</span>
        <Button variant="ghost" size="icon-sm" aria-label={`Eliminar serie ${number}`} onClick={onRemove}>
          <Trash2Icon />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stepper
          label="Peso (kg)"
          value={set.weightKg}
          step={WEIGHT_STEP_KG}
          inputMode="decimal"
          onAdjust={(delta) => onAdjust('weightKg', delta)}
          onChange={(weightKg) => onChange({ weightKg })}
        />
        <Stepper
          label="Reps"
          value={set.reps}
          step={1}
          inputMode="numeric"
          onAdjust={(delta) => onAdjust('reps', delta)}
          onChange={(reps) => onChange({ reps })}
        />
      </div>

      {lastTime && <LastTimeLine comparison={lastTime} onBeat={(target) => onChange(target)} />}

      {isRecord && (
        <p
          role="status"
          className="bg-chart-4/15 text-chart-4 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium"
        >
          <TrophyIcon className="motion-safe:animate-in motion-safe:spin-in-12 size-4 shrink-0" aria-hidden />
          Con {set.reps} reps a {formatDecimal(set.weightKg)} kg haces récord personal
        </p>
      )}

      {/* Optional and mostly skipped, so it stays folded and leaves "Hecho" within reach. */}
      {!rpeOpen ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground -ml-1 h-8"
          aria-expanded={false}
          aria-label="Anotar esfuerzo (RPE)"
          onClick={() => setRpeOpen(true)}
        >
          <PlusIcon />
          Esfuerzo (RPE)
        </Button>
      ) : (
        <div>
          <p id={rpeLabelId} className="text-muted-foreground mb-1 text-xs">
            Esfuerzo (RPE), opcional
          </p>
          {/* Toggle buttons rather than a select: one tap, and tapping the chosen one clears it. */}
          <div role="group" aria-labelledby={rpeLabelId} className="grid grid-cols-5 gap-1">
            {RPE_OPTIONS.map((rpe) => {
              const selected = set.rpe === rpe
              return (
                <Button
                  key={rpe}
                  variant={selected ? 'default' : 'outline'}
                  className="h-9 px-0 text-sm tabular-nums"
                  aria-pressed={selected}
                  aria-label={`RPE ${formatDecimal(rpe)}`}
                  onClick={() => onChange({ rpe: selected ? null : rpe })}
                >
                  {formatDecimal(rpe)}
                </Button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {canGoBack && (
          <Button
            variant="outline"
            size="icon-lg"
            className="size-12 shrink-0"
            aria-label="Corregir la serie anterior"
            onClick={onBack}
          >
            <ArrowLeftIcon />
          </Button>
        )}
        <Button
          size="lg"
          className="h-12 flex-1 text-base"
          aria-label={`Completar serie ${number}`}
          onClick={onDone}
        >
          <CheckIcon />
          Hecho
        </Button>
      </div>
    </div>
  )
}

/**
 * Progressive overload made visible: the same set last session, live against what is entered now, and
 * one tap to aim for one more rep when it is not beaten yet.
 */
function LastTimeLine({
  comparison: { last, verdict },
  onBeat,
}: {
  comparison: LastTimeComparison
  onBeat: (target: Pick<DraftSet, 'reps' | 'weightKg'>) => void
}) {
  const ahead = verdict === 'beaten' || verdict === 'extra'
  const lastText = last && (
    <span className="whitespace-nowrap">
      {formatDecimal(last.weight_kg)} kg × {last.reps}
    </span>
  )

  return (
    <div
      role="status"
      className={cn(
        'flex min-h-9 items-center gap-2 rounded-md px-2 py-1 text-sm',
        ahead ? 'bg-primary/15 text-foreground font-medium' : 'bg-muted text-muted-foreground',
      )}
    >
      <TrendingUpIcon className={cn('size-4 shrink-0', ahead && 'text-primary')} aria-hidden />
      <span className="flex-1">
        {verdict === 'beaten' && <>Superas la última vez ({lastText})</>}
        {verdict === 'extra' && 'Una serie más que la última vez'}
        {verdict === 'matched' && <>Igual que la última vez ({lastText})</>}
        {verdict === 'below' && <>Última vez: {lastText}</>}
      </span>
      {last && !ahead && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0"
          aria-label={`Supéralo con ${last.reps + 1} reps a ${formatDecimal(last.weight_kg)} kg`}
          onClick={() => onBeat({ weightKg: last.weight_kg, reps: last.reps + 1 })}
        >
          Supéralo: {last.reps + 1} reps
        </Button>
      )}
    </div>
  )
}
