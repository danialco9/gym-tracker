import { ChevronDownIcon, StarIcon } from 'lucide-react'
import { useState } from 'react'
import { formatDay } from '@/lib/format'
import type { Milestone } from '@/lib/types'
import { milestoneTitle } from './milestones'

const SHOWN_FIRST = 3

/** The latest strength milestones, the rest one tap away. Nothing to score: only moments to remember. */
export function MilestonesCard({ milestones }: { milestones: Milestone[] }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? milestones : milestones.slice(0, SHOWN_FIRST)

  return (
    <section className="space-y-2" aria-labelledby="milestones-heading">
      <h2 id="milestones-heading" className="eyebrow">
        Hitos
      </h2>
      {milestones.length === 0 ? (
        <p className="text-muted-foreground bg-card ring-foreground/10 rounded-xl p-4 text-sm ring-1">
          Aún no hay hitos. Llegan al subir a un peso redondo (40, 60, 80 kg…) o 10 kg más que tu primer día
          en un ejercicio.
        </p>
      ) : (
        <div className="bg-card ring-foreground/10 rounded-xl ring-1">
          <ul className="divide-border divide-y">
            {shown.map((milestone) => (
              <li
                key={`${milestone.exercise_id}-${milestone.kind}-${milestone.value_kg}`}
                className="flex items-start gap-3 px-4 py-3"
              >
                <StarIcon className="text-primary fill-primary mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-medium">{milestoneTitle(milestone)}</span>
                  <span className="text-muted-foreground block truncate text-sm">
                    {milestone.exercise_name} · {formatDay(milestone.achieved_on)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {milestones.length > SHOWN_FIRST && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground border-border flex h-11 w-full items-center justify-center gap-1 border-t text-sm"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? 'Ver menos' : `Ver todos (${milestones.length})`}
              <ChevronDownIcon className={expanded ? 'size-4 rotate-180' : 'size-4'} aria-hidden />
            </button>
          )}
        </div>
      )}
    </section>
  )
}
