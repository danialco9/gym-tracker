import { BellIcon, BellRingIcon, XIcon } from 'lucide-react'
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

interface RestBarProps {
  remaining: number
  duration: number
  /** The countdown ran out by itself: the bar says "go" for a moment, then goes away. */
  ready: boolean
  next: NextSet
  onAdjust: (seconds: number) => void
  onSkip: () => void
  /** Whether this phone is told when the rest is over, even locked. */
  notification: RestPushStatus
  onEnableNotification: () => void
}

/**
 * The rest between sets sits in a bar above the navigation, so the rest of the app stays usable:
 * check the technique, fix a set, switch exercise. It goes away by itself, or with the cross.
 */
export function RestBar({
  remaining,
  duration,
  ready,
  next,
  onAdjust,
  onSkip,
  notification,
  onEnableNotification,
}: RestBarProps) {
  const offersNotification = notification === 'off' || notification === 'on'
  return (
    <section
      aria-label="Descanso"
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 px-2 pb-2 lg:bottom-4 lg:left-64"
    >
      <div className="bg-card ring-foreground/10 mx-auto max-w-2xl space-y-2 rounded-2xl p-3 shadow-lg ring-1">
        <div className="flex items-center gap-3">
          {ready ? (
            <p
              role="status"
              className="text-primary motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 min-w-0 flex-1 font-semibold"
            >
              ¡A por la serie {next.number}!
              <span className="text-muted-foreground block truncate text-sm font-normal">
                {next.exerciseName}
              </span>
            </p>
          ) : (
            <>
              <ProgressRing value={duration > 0 ? remaining / duration : 0} size={52} strokeWidth={5}>
                <span role="timer" className="text-sm font-semibold tabular-nums">
                  <span className="sr-only">Descanso </span>
                  {formatSeconds(remaining)}
                </span>
              </ProgressRing>
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-xs">Siguiente</p>
                <p className="truncate text-sm font-semibold">
                  {next.exerciseName} · serie {next.number}
                </p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {next.reps} × {formatDecimal(next.weightKg)} kg
                </p>
              </div>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            aria-label="Saltar descanso"
            onClick={onSkip}
          >
            <XIcon />
          </Button>
        </div>

        {!ready && (
          <div className={offersNotification ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'}>
            <Button
              variant="secondary"
              className="h-10"
              aria-label={`Quitar ${SHORTER_REST_SECONDS} segundos`}
              onClick={() => onAdjust(-SHORTER_REST_SECONDS)}
            >
              −{SHORTER_REST_SECONDS} s
            </Button>
            <Button
              variant="secondary"
              className="h-10"
              aria-label={`Añadir ${LONGER_REST_SECONDS} segundos`}
              onClick={() => onAdjust(LONGER_REST_SECONDS)}
            >
              +{LONGER_REST_SECONDS} s
            </Button>
            {/* Offered where it matters: the moment the phone is about to go back in the pocket. */}
            {notification === 'off' && (
              <Button
                variant="outline"
                className="h-10"
                aria-label="Avisarme al acabar el descanso"
                onClick={onEnableNotification}
              >
                <BellIcon />
                Avisarme
              </Button>
            )}
            {notification === 'on' && (
              <p className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
                <BellRingIcon className="size-4 shrink-0" aria-hidden />
                Aviso activado
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
