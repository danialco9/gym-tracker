import { ChevronRightIcon, ScaleIcon, UserPenIcon, UsersIcon } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { QueryStatus } from '@/components/QueryStatus'
import { useCurrentUser } from '@/features/auth/queries'
import { useExerciseRanking, useMyRanking, useZoneRanking } from '@/features/ranking/queries'
import { TierMedal } from '@/features/ranking/TierMedal'
import { formatDecimal } from '@/lib/format'
import { nextTier, STRENGTH_TIERS, ZONE_LABELS } from '@/lib/labels'
import type { MyLift, MyRanking, RankingEntry, RankingMe, StrengthTier, Zone } from '@/lib/types'
import { cn } from '@/lib/utils'

const SELECT_CLASS =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-lg border px-3 text-base outline-none focus-visible:ring-3'

/** "Más fuerte que el 64 %": rounded down, so nobody reads 100 % while someone still lifts more. */
function strongerThan(percentile: number): string {
  return `Más fuerte que el ${Math.floor(percentile)} %`
}

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

/** The bar from a tier to the next one, with the tier it leads to; nothing at Master. */
function TierProgress({ tier, progress }: { tier: StrengthTier; progress: number }) {
  const next = nextTier(tier)
  if (next === null) {
    return null
  }
  return (
    <div className="space-y-1">
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
        {Math.round(progress * 100)} % del camino a {STRENGTH_TIERS[next].label}
      </p>
    </div>
  )
}

/** The zone with the best percentile, where the page opens; the first zone while there is none. */
function bestZone(mine: MyRanking): Zone {
  const ranked = mine.zones.filter((zone) => zone.percentile !== null)
  if (ranked.length === 0) {
    return mine.zones[0].zone
  }
  return ranked.reduce((best, zone) => ((zone.percentile ?? 0) > (best.percentile ?? 0) ? zone : best)).zone
}

function ZonePicker({
  mine,
  selected,
  onSelect,
}: {
  mine: MyRanking
  selected: Zone
  onSelect: (zone: Zone) => void
}) {
  return (
    <div role="radiogroup" aria-label="Zona" className="grid grid-cols-3 gap-2">
      {mine.zones.map(({ zone, tier, percentile }) => (
        <button
          key={zone}
          type="button"
          role="radio"
          aria-checked={zone === selected}
          onClick={() => onSelect(zone)}
          className={cn(
            'bg-card ring-foreground/10 flex flex-col items-center gap-1 rounded-xl p-3 ring-1 transition-colors',
            zone === selected ? 'ring-primary bg-primary/10 ring-2' : 'hover:bg-accent',
          )}
        >
          {tier === null ? (
            <span className="bg-muted size-9 rounded-full" aria-hidden />
          ) : (
            <TierMedal tier={tier} className="size-9" />
          )}
          <span className="text-sm font-medium">{ZONE_LABELS[zone].label}</span>
          {/* Tier and percentile on lines of their own: "Esmeralda · 88 %" does not fit a third of a phone. */}
          <span className="text-muted-foreground text-center text-xs leading-tight tabular-nums">
            {tier === null || percentile === null ? (
              'Sin rango'
            ) : (
              <>
                <span className="block">{STRENGTH_TIERS[tier].label}</span>
                <span className="block">{Math.floor(percentile)} %</span>
              </>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}

function standing(me: RankingMe, total: number): string {
  if (!me.show_in_ranking) {
    return 'Estás oculto: los demás no te ven'
  }
  return me.position === null ? 'Aún no apareces en la lista' : `Puesto ${me.position} de ${total}`
}

function MyTier({ me, total, empty }: { me: RankingMe; total: number; empty: string }) {
  if (me.tier === null || me.percentile === null) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">{empty}</p>
    )
  }
  return (
    <section className="bg-card ring-foreground/10 space-y-4 rounded-xl p-4 ring-1" aria-label="Tu rango">
      <div className="flex items-center gap-4">
        <TierMedal tier={me.tier} className="size-16" />
        <div className="min-w-0">
          <p className="font-heading text-2xl font-semibold" style={{ color: STRENGTH_TIERS[me.tier].color }}>
            {STRENGTH_TIERS[me.tier].label}
          </p>
          <p className="font-medium">{strongerThan(me.percentile)}</p>
          <p className="text-muted-foreground text-sm">{standing(me, total)}</p>
        </div>
      </div>
      <TierProgress tier={me.tier} progress={me.progress ?? 0} />
    </section>
  )
}

/** One of the user's exercises: its tier, how many lift less, and the set that earned it. */
function LiftCard({ lift }: { lift: MyLift }) {
  return (
    <li className="bg-card ring-foreground/10 space-y-3 rounded-xl p-4 ring-1">
      <div className="flex items-center gap-3">
        <TierMedal tier={lift.tier} className="size-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{lift.exercise.name}</p>
          <p className="text-sm">
            <span className="font-semibold" style={{ color: STRENGTH_TIERS[lift.tier].color }}>
              {STRENGTH_TIERS[lift.tier].label}
            </span>{' '}
            · {strongerThan(lift.percentile)}
          </p>
        </div>
      </div>
      <TierProgress tier={lift.tier} progress={lift.progress} />
      <p className="text-muted-foreground flex justify-between gap-2 text-xs">
        <span className="tabular-nums">
          Tu mejor:{' '}
          {lift.weight_kg > 0 ? `${formatDecimal(lift.weight_kg)} kg × ${lift.reps}` : `${lift.reps} reps`}
        </span>
        <span>{lift.source === 'app' ? 'Frente a usuarios de la app' : 'Estimación'}</span>
      </p>
    </li>
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

function ExerciseEntries({ exerciseId }: { exerciseId: number }) {
  const ranking = useExerciseRanking(exerciseId)
  return (
    <>
      <QueryStatus query={ranking} loading="Cargando…" error="No se pudo cargar el ranking." />
      {ranking.data !== undefined && <Entries entries={ranking.data.entries} />}
    </>
  )
}

/** The zone's standing, the user's exercises in it and the list of everyone, whole zone or one exercise. */
function ZoneSection({ zone, lifts }: { zone: Zone; lifts: MyLift[] }) {
  const selectId = useId()
  const ranking = useZoneRanking(zone)
  const [exerciseId, setExerciseId] = useState<number | null>(null)
  const label = ZONE_LABELS[zone].label

  return (
    <div className="space-y-6">
      <QueryStatus query={ranking} loading="Cargando…" error="No se pudo cargar el ranking." />
      {ranking.data !== undefined && (
        <MyTier
          me={ranking.data.me}
          total={ranking.data.entries.length}
          empty={`Registra ejercicios de ${label.toLowerCase()} con peso para tener rango aquí.`}
        />
      )}

      {lifts.length > 0 && (
        <section className="space-y-3">
          <h2 className="eyebrow">Tus ejercicios</h2>
          <ul className="space-y-3">
            {lifts.map((lift) => (
              <LiftCard key={lift.exercise.id} lift={lift} />
            ))}
          </ul>
        </section>
      )}

      {ranking.data !== undefined && (
        <section className="space-y-3">
          <h2 className="eyebrow">Clasificación</h2>
          {ranking.data.exercises.length > 0 && (
            <div className="space-y-2">
              <label htmlFor={selectId} className="sr-only">
                Ver
              </label>
              <select
                id={selectId}
                className={SELECT_CLASS}
                value={exerciseId ?? 'zone'}
                onChange={(event) =>
                  setExerciseId(event.target.value === 'zone' ? null : Number(event.target.value))
                }
              >
                <option value="zone">Toda la zona: {label}</option>
                {ranking.data.exercises.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {exerciseId === null ? (
            <Entries entries={ranking.data.entries} />
          ) : (
            <ExerciseEntries exerciseId={exerciseId} />
          )}
        </section>
      )}
    </div>
  )
}

export function RankingPage() {
  const user = useCurrentUser().data
  const mine = useMyRanking()
  const [zone, setZone] = useState<Zone | null>(null)

  let prompt: ReactNode = null
  if (mine.data?.needs_body_weight) {
    prompt = (
      <Prompt
        to="/medidas"
        icon={ScaleIcon}
        title="Apunta tu peso"
        hint="El rango compara lo que levantas con lo que pesas"
      />
    )
  } else if (user != null && user.sex === null) {
    prompt = (
      <Prompt
        to="/cuenta"
        icon={UsersIcon}
        title="¿Con quién te comparamos?"
        hint="Elige hombres o mujeres para que tu rango sea justo"
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

  const selected = zone ?? (mine.data === undefined ? null : bestZone(mine.data))

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ranking"
        title="Ranking de fuerza"
        description="Te comparamos con gente que entrena según lo que levantas para tu peso. Los demás solo ven tu rango, nunca tus kilos."
      />
      {prompt}
      <QueryStatus query={mine} loading="Cargando…" error="No se pudo cargar el ranking." />
      {mine.data !== undefined && selected !== null && (
        <>
          <ZonePicker mine={mine.data} selected={selected} onSelect={setZone} />
          <ZoneSection
            key={selected}
            zone={selected}
            lifts={mine.data.lifts.filter((lift) => lift.zone === selected)}
          />
        </>
      )}
    </div>
  )
}
