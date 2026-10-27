import { BellIcon, BellRingIcon } from 'lucide-react'
import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { formatDecimal, formatSeconds } from '@/lib/format'
import { ProgressRing } from './ProgressRing'
import type { RestPushStatus } from './rest-push'

export const SHORTER_REST_SECONDS = 15
export const LONGER_REST_SECONDS = 30

export interface NextSet {
  exerciseName: string
  number: number
  reps: number
  weightKg: number
}

interface RestTimerScreenProps {
  remaining: number
  duration: number
  next: NextSet
  onAdjust: (seconds: number) => void
  onSkip: () => void
  /** Whether this phone is told when the rest is over, even locked. */
  notification: RestPushStatus
  onEnableNotification: () => void
}

/**
 * The rest between sets takes the whole screen: the countdown reads from across the gym, and the
 * next set is already announced. It closes by itself when the time is up, or with "Ya estoy listo".
 */
export function RestTimerScreen({
  remaining,
  duration,
  next,
  onAdjust,
  onSkip,
  notification,
  onEnableNotification,
}: RestTimerScreenProps) {
  const titleId = useId()
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={(event) => event.key === 'Escape' && onSkip()}
      className="bg-background fixed inset-0 z-50 overflow-y-auto"
    >
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <h2 id={titleId} className="eyebrow text-center">
          Descanso
        </h2>

        <div className="flex justify-center">
          <ProgressRing value={duration > 0 ? remaining / duration : 0} size={256} strokeWidth={16}>
            <span role="timer" className="text-6xl font-semibold tabular-nums">
              <span className="sr-only">Descanso </span>
              {formatSeconds(remaining)}
            </span>
          </ProgressRing>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="lg"
            className="h-12 text-base"
            aria-label={`Quitar ${SHORTER_REST_SECONDS} segundos`}
            onClick={() => onAdjust(-SHORTER_REST_SECONDS)}
          >
            −{SHORTER_REST_SECONDS} s
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="h-12 text-base"
            aria-label={`Añadir ${LONGER_REST_SECONDS} segundos`}
            onClick={() => onAdjust(LONGER_REST_SECONDS)}
          >
            +{LONGER_REST_SECONDS} s
          </Button>
        </div>

        <div className="bg-card ring-foreground/10 rounded-xl p-4 ring-1">
          <p className="text-muted-foreground text-xs">Siguiente</p>
          <p className="font-semibold">
            {next.exerciseName} · serie {next.number}
          </p>
          <p className="text-muted-foreground text-sm tabular-nums">
            {next.reps} × {formatDecimal(next.weightKg)} kg
          </p>
        </div>

        {/* Offered where it matters: the moment the phone is about to go back in the pocket. */}
        {notification === 'off' && (
          <Button variant="outline" size="lg" className="h-12 text-base" onClick={onEnableNotification}>
            <BellIcon />
            Avisarme al acabar el descanso
          </Button>
        )}
        {notification === 'on' && (
          <p className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
            <BellRingIcon className="size-4" aria-hidden />
            Te avisamos aunque bloquees el móvil
          </p>
        )}

        <Button size="lg" className="mt-auto h-14 text-lg" onClick={onSkip} autoFocus>
          Ya estoy listo
        </Button>
      </div>
    </div>
  )
}
