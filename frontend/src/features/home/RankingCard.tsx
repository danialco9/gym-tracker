import { ChevronRightIcon } from 'lucide-react'
import { Link } from 'react-router'
import { useMyRanking } from '@/features/ranking/queries'
import { TierMedal } from '@/features/ranking/TierMedal'
import { STRENGTH_TIERS, ZONE_LABELS } from '@/lib/labels'
import type { MyRanking, User } from '@/lib/types'

function summary(ranking: MyRanking): string {
  if (ranking.needs_body_weight) {
    return 'Apunta tu peso para tener rango'
  }
  const ranked = ranking.zones.filter((zone) => zone.tier !== null && zone.percentile !== null)
  if (ranked.length === 0) {
    return 'Registra entrenos con peso para tener rango'
  }
  const best = ranked.reduce((top, zone) => ((zone.percentile ?? 0) > (top.percentile ?? 0) ? zone : top))
  return `Mejor: ${ZONE_LABELS[best.zone].label} · ${STRENGTH_TIERS[best.tier ?? 'bronze'].label}`
}

/** A medal per body zone, a way into the ranking and, until there is one, a nudge to pick a nickname. */
export function RankingCard({ user }: { user: User }) {
  const ranking = useMyRanking().data
  if (ranking === undefined) {
    return null
  }

  return (
    <Link
      to="/ranking"
      className="bg-card ring-foreground/10 hover:bg-accent block space-y-3 rounded-xl p-4 ring-1 transition-colors"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="font-medium">Ranking de fuerza</span>
        <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
      </span>
      <ul className="grid grid-cols-6 gap-1">
        {ranking.zones.map(({ zone, tier }) => (
          <li key={zone} className="flex min-w-0 flex-col items-center gap-1">
            {tier === null ? (
              <span className="bg-muted size-8 rounded-full" aria-hidden />
            ) : (
              <TierMedal tier={tier} className="size-8" />
            )}
            <span className="text-muted-foreground w-full truncate text-center text-[0.7rem]">
              {ZONE_LABELS[zone].short}
              <span className="sr-only">: {tier === null ? 'sin rango' : STRENGTH_TIERS[tier].label}</span>
            </span>
          </li>
        ))}
      </ul>
      <span className="text-muted-foreground block text-sm">{summary(ranking)}</span>
      {user.nickname === null && (
        <span className="text-primary block text-sm">Elige tu apodo: ahora sales como Atleta {user.id}</span>
      )}
    </Link>
  )
}
