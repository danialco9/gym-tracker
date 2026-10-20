import { ChevronRightIcon, ScaleIcon, UserPenIcon } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { QueryStatus } from '@/components/QueryStatus'
import { useCurrentUser } from '@/features/auth/queries'
import { useExerciseRanking, useRanking } from '@/features/ranking/queries'
import { TierMedal } from '@/features/ranking/TierMedal'
import { nextTier, STRENGTH_TIERS } from '@/lib/labels'
import type { RankingEntry, RankingMe } from '@/lib/types'
import { cn } from '@/lib/utils'

const SELECT_CLASS =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-lg border px-3 text-base outline-none focus-visible:ring-3'

function Prompt({
  to,
  icon: Icon,
  title,
  hint,
}: {
  to: string
  icon: typeof ScaleIcon
  title: string
  hint: string
}) {
  return (
    <Link
      to={to}
      className="bg-primary/10 ring-primary/40 hover:bg-primary/15 flex items-center justify-between gap-3 rounded-xl p-4 ring-1 transition-colors"
    >
      <span className="flex min-w-0 items-center gap-3">
        <Icon className="text-primary size-5 shrink-0" aria-hidden />
        <span className="min-w-0">
          <span className="block font-medium">{title}</span>
          <span className="text-muted-foreground block text-sm">{hint}</span>
        </span>
      </span>
      <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
    </Link>
  )
}

function standing(me: RankingMe, total: number): string {
  if (!me.show_in_ranking) {
    return 'Estás oculto: los demás no te ven'
  }
  return me.position === null ? 'Aún no apareces en la lista' : `Puesto ${me.position} de ${total}`
}

function MyTier({ me, total, empty }: { me: RankingMe; total: number; empty: string }) {
  if (me.tier === null) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">{empty}</p>
    )
  }
  const next = nextTier(me.tier)
  const progress = me.progress ?? 0
  return (
    <section className="bg-card ring-foreground/10 space-y-4 rounded-xl p-4 ring-1" aria-label="Tu rango">
      <div className="flex items-center gap-4">
        <TierMedal tier={me.tier} className="size-16" />
        <div className="min-w-0">
          <p className="eyebrow">Tu rango</p>
          <p className="font-heading text-2xl font-semibold" style={{ color: STRENGTH_TIERS[me.tier].color }}>
            {STRENGTH_TIERS[me.tier].label}
          </p>
          <p className="text-muted-foreground text-sm">{standing(me, total)}</p>
        </div>
      </div>
      {next !== null && (
        <div className="space-y-1.5">
          <div
            role="progressbar"
            aria-label={`Hacia ${STRENGTH_TIERS[next].label}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="bg-muted h-2 overflow-hidden rounded-full"
          >
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${progress * 100}%`, backgroundColor: STRENGTH_TIERS[next].color }}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            {Math.round(progress * 100)}% del camino a {STRENGTH_TIERS[next].label}
          </p>
        </div>
      )}
    </section>
  )
}

function Entries({ entries }: { entries: RankingEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
        Todavía no hay nadie en esta lista.
      </p>
    )
  }
  return (
    <ol aria-label="Clasificación" className="bg-card ring-foreground/10 divide-y rounded-xl ring-1">
      {entries.map((entry) => (
        <li
          key={entry.position}
          className={cn('flex items-center gap-3 px-4 py-3', entry.is_me && 'bg-primary/10')}
        >
          <span className="text-muted-foreground w-6 shrink-0 text-right text-sm tabular-nums">
            {entry.position}
          </span>
          <TierMedal tier={entry.tier} className="size-8" />
          <span className="min-w-0 flex-1 truncate font-medium">
            {entry.name}
            {entry.is_me && <span className="text-primary"> (tú)</span>}
          </span>
          <span className="text-sm font-medium" style={{ color: STRENGTH_TIERS[entry.tier].color }}>
            {STRENGTH_TIERS[entry.tier].label}
          </span>
        </li>
      ))}
    </ol>
  )
}

function Board({ me, entries, empty }: { me: RankingMe; entries: RankingEntry[]; empty: string }) {
  return (
    <div className="space-y-4">
      <MyTier me={me} total={entries.length} empty={empty} />
      <Entries entries={entries} />
    </div>
  )
}

function ExerciseBoard({ exerciseId }: { exerciseId: number }) {
  const ranking = useExerciseRanking(exerciseId)
  return (
    <>
      <QueryStatus query={ranking} loading="Cargando…" error="No se pudo cargar el ranking." />
      {ranking.data !== undefined && (
        <Board
          me={ranking.data.me}
          entries={ranking.data.entries}
          empty="Registra este ejercicio para tener rango en él."
        />
      )}
    </>
  )
}

export function RankingPage() {
  const selectId = useId()
  const user = useCurrentUser().data
  const ranking = useRanking()
  const [exerciseId, setExerciseId] = useState<number | null>(null)

  let prompt: ReactNode = null
  if (ranking.data?.me.needs_body_weight) {
    prompt = (
      <Prompt
        to="/medidas"
        icon={ScaleIcon}
        title="Apunta tu peso"
        hint="El rango compara lo que levantas con lo que pesas"
      />
    )
  } else if (user != null && user.nickname === null) {
    prompt = (
      <Prompt
        to="/cuenta"
        icon={UserPenIcon}
        title="Elige tu apodo"
        hint={`Ahora sales como Atleta ${user.id}`}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ranking"
        title="Ranking de fuerza"
        description="Lo que levantas según tu peso, de Bronce a Máster. Solo se ve el rango, nunca los kilos."
      />
      {prompt}
      <QueryStatus query={ranking} loading="Cargando…" error="No se pudo cargar el ranking." />
      {ranking.data !== undefined && (
        <>
          {ranking.data.exercises.length > 0 && (
            <div className="space-y-2">
              <label htmlFor={selectId} className="text-sm font-medium">
                Ver
              </label>
              <select
                id={selectId}
                className={SELECT_CLASS}
                value={exerciseId ?? 'general'}
                onChange={(event) =>
                  setExerciseId(event.target.value === 'general' ? null : Number(event.target.value))
                }
              >
                <option value="general">General (tus 5 mejores ejercicios)</option>
                {ranking.data.exercises.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {exerciseId === null ? (
            <Board
              me={ranking.data.me}
              entries={ranking.data.entries}
              empty="Registra entrenos con peso para tener rango."
            />
          ) : (
            <ExerciseBoard exerciseId={exerciseId} />
          )}
        </>
      )}
    </div>
  )
}
