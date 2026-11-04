import { FlameIcon } from 'lucide-react'
import { plural } from '@/lib/format'
import type { Streak } from '@/lib/types'
import { cn } from '@/lib/utils'

function streakHint({ current_days, best_days, at_risk }: Streak) {
  if (current_days === 0) {
    return 'Entrena hoy para empezar una racha'
  }
  if (at_risk) {
    return 'Entrena hoy o la pierdes'
  }
  return `Puedes descansar un día sin perderla · mejor: ${best_days} ${plural(best_days, 'día', 'días')}`
}

/** Days in a row with workouts: one line with the flame, and a hint below. */
export function StreakCard({ streak }: { streak: Streak }) {
  return (
    <section
      aria-label="Tu racha"
      className={cn(
        'bg-card space-y-1 rounded-xl p-4 ring-1',
        streak.at_risk ? 'ring-chart-4/60' : 'ring-foreground/10',
      )}
    >
      <p className="flex items-center gap-2">
        <FlameIcon
          className={cn('size-5', streak.current_days > 0 ? 'text-chart-4' : 'text-muted-foreground')}
          aria-hidden
        />
        <span className="font-heading text-lg font-semibold tabular-nums">
          {streak.current_days} {plural(streak.current_days, 'día', 'días')} de racha
        </span>
      </p>
      <p className={cn('text-xs', streak.at_risk ? 'text-chart-4' : 'text-muted-foreground')}>
        {streakHint(streak)}
      </p>
    </section>
  )
}
