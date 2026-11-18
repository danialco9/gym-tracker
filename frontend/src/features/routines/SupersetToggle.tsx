import { Link2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SupersetToggleProps {
  linked: boolean
  first: string
  second: string
  onToggle: (linked: boolean) => void
}

/**
 * Between two exercises of a routine: joins them in a superset, so the workout alternates their sets
 * and rests after the round, or splits them again. Several joined in a row make a circuit.
 */
export function SupersetToggle({ linked, first, second, onToggle }: SupersetToggleProps) {
  return (
    <div className="flex justify-center pt-3">
      <button
        type="button"
        aria-pressed={linked}
        aria-label={`Superserie de ${first} con ${second}`}
        onClick={() => onToggle(!linked)}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors',
          linked
            ? 'bg-primary/15 text-primary ring-primary/40 ring-1'
            : 'text-muted-foreground hover:text-foreground ring-foreground/15 ring-1',
        )}
      >
        <Link2Icon className="size-4" aria-hidden />
        {linked ? 'Superserie' : 'Unir en superserie'}
      </button>
    </div>
  )
}
