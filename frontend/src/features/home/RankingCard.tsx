import { ChevronRightIcon, TrophyIcon } from 'lucide-react'
import { Link } from 'react-router'
import { useRanking } from '@/features/ranking/queries'
import { TierMedal } from '@/features/ranking/TierMedal'
import { STRENGTH_TIERS } from '@/lib/labels'
import type { RankingMe, User } from '@/lib/types'

function summary(me: RankingMe, total: number): string {
  if (me.needs_body_weight) {
    return 'Apunta tu peso para tener rango'
  }
  if (me.tier === null) {
    return 'Registra entrenos con peso para tener rango'
  }
  const tier = STRENGTH_TIERS[me.tier].label
  return me.position === null ? tier : `${tier} · puesto ${me.position} de ${total}`
}

/** The user's overall tier, a way into the ranking and, until there is one, a nudge to pick a nickname. */
export function RankingCard({ user }: { user: User }) {
  const ranking = useRanking().data
  if (ranking === undefined) {
    return null
  }
  const { me, entries } = ranking

  return (
    <Link
      to="/ranking"
      className="bg-card ring-foreground/10 hover:bg-accent flex items-center justify-between gap-3 rounded-xl p-4 ring-1 transition-colors"
    >
      <span className="flex min-w-0 items-center gap-3">
        {me.tier === null ? (
          <TrophyIcon className="text-primary size-5 shrink-0" aria-hidden />
        ) : (
          <TierMedal tier={me.tier} className="size-10" />
        )}
        <span className="min-w-0">
          <span className="block font-medium">Ranking de fuerza</span>
          <span className="text-muted-foreground block text-sm">{summary(me, entries.length)}</span>
          {user.nickname === null && (
            <span className="text-primary block text-sm">
              Elige tu apodo: ahora sales como Atleta {user.id}
            </span>
          )}
        </span>
      </span>
      <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
    </Link>
  )
}
