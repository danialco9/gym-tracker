import { ArrowLeftIcon, CheckIcon, Trash2Icon, TrophyIcon } from 'lucide-react'
import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { formatDecimal } from '@/lib/format'
import { WEIGHT_STEP_KG, type DraftSet } from './draft'
import { Stepper } from './Stepper'

const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]

interface ActiveSetProps {
  number: number
  set: DraftSet
  canGoBack: boolean
  /** The reps and weight entered would beat the exercise's best estimated 1RM. */
  isRecord: boolean
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
  onAdjust,
  onChange,
  onDone,
  onBack,
  onRemove,
}: ActiveSetProps) {
  const rpeLabelId = useId()

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

      {isRecord && (
        <p
          role="status"
          className="bg-chart-4/15 text-chart-4 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium"
        >
          <TrophyIcon className="motion-safe:animate-in motion-safe:spin-in-12 size-4 shrink-0" aria-hidden />
          Con {set.reps} reps a {formatDecimal(set.weightKg)} kg haces récord personal
        </p>
      )}

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
