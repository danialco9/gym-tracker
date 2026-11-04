import { ChevronRightIcon } from 'lucide-react'
import { Link } from 'react-router'
import { BodyMap } from '@/features/ranking/BodyMap'
import { useMyRanking } from '@/features/ranking/queries'
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

/** The body coloured by tier, a way into the ranking and, until there is one, a nudge to pick a nickname. */
export function RankingCard({ user }: { user: User }) {
  const ranking = useMyRanking().data
  if (ranking === undefined) {
    return null
  }

  return (
    <Link
      to="/ranking"
      className="bg-card ring-foreground/10 hover:bg-accent flex items-center gap-4 rounded-xl p-4 ring-1 transition-colors"
    >
      <BodyMap zones={ranking.zones} className="w-36 shrink-0 gap-2" />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-center justify-between gap-2">
          <span className="font-medium">Ranking de fuerza</span>
          <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
        </span>
        <span className="text-muted-foreground block text-sm">{summary(ranking)}</span>
        {user.nickname === null && (
          <span className="text-primary block text-sm">
            Elige tu apodo: ahora sales como Atleta {user.id}
          </span>
        )}
      </span>
    </Link>
  )
}
