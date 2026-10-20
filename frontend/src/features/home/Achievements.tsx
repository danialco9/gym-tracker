import { AwardIcon, CheckIcon, FlameIcon, LockIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { plural } from '@/lib/format'
import { BADGE_LABELS, MISSION_LABELS } from '@/lib/labels'
import type { Achievements as AchievementsData } from '@/lib/types'
import { cn } from '@/lib/utils'

const SEEN_XP_KEY = 'gym-tracker:seen-xp:v1'

interface Seen {
  xp: number
  level: number
}

function loadSeen(userId: number): Seen | null {
  try {
    const raw = window.localStorage.getItem(`${SEEN_XP_KEY}:${userId}`)
    const parsed: unknown = raw === null ? null : JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && 'xp' in parsed && 'level' in parsed) {
      const { xp, level } = parsed
      return typeof xp === 'number' && typeof level === 'number' ? { xp, level } : null
    }
    return null
  } catch {
    return null
  }
}

function saveSeen(userId: number, seen: Seen) {
  try {
    window.localStorage.setItem(`${SEEN_XP_KEY}:${userId}`, JSON.stringify(seen))
  } catch {
    // Without storage the gain is simply not celebrated.
  }
}

/**
 * The XP and level gained since the user last saw the home screen, e.g. the workout just saved
 * (or one the offline queue sent later). Nothing on a first visit, where there is no "before".
 */
function useGain(userId: number, achievements: AchievementsData) {
  const [before] = useState(() => loadSeen(userId))
  const { xp, number: level } = achievements.level
  useEffect(() => saveSeen(userId, { xp, level }), [userId, xp, level])
  if (before === null || xp <= before.xp) {
    return null
  }
  return { xp: xp - before.xp, newLevel: level > before.level ? level : null }
}

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className="bg-muted h-2 overflow-hidden rounded-full"
    >
      <div
        className="bg-primary h-full rounded-full transition-[width] duration-700"
        style={{ width: `${Math.min(value / max, 1) * 100}%` }}
      />
    </div>
  )
}

function streakHint({ current_days, best_days, at_risk }: AchievementsData['streak']) {
  if (current_days === 0) {
    return 'Entrena hoy para empezar una racha'
  }
  if (at_risk) {
    return 'Entrena hoy o la pierdes'
  }
  return `Puedes descansar un día sin perderla · mejor: ${best_days} ${plural(best_days, 'día', 'días')}`
}

export function Achievements({ userId, achievements }: { userId: number; achievements: AchievementsData }) {
  const { level, streak, missions, badges } = achievements
  const gain = useGain(userId, achievements)
  const earned = badges.filter((badge) => badge.earned_on !== null).length

  return (
    <section aria-labelledby="achievements-title" className="space-y-3">
      <h2 id="achievements-title" className="sr-only">
        Tus logros
      </h2>

      {gain?.newLevel != null && (
        <p
          role="status"
          className="bg-primary text-primary-foreground animate-in zoom-in-90 fade-in rounded-xl p-4 text-center font-semibold duration-500"
        >
          ¡Subes a nivel {gain.newLevel}!
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="bg-card ring-foreground/10 space-y-3 rounded-xl p-4 ring-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-heading text-lg font-semibold">Nivel {level.number}</p>
            {gain !== null && (
              <span
                role="status"
                className="bg-primary/15 text-primary animate-in slide-in-from-bottom-2 fade-in rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums duration-500"
              >
                +{gain.xp} XP
              </span>
            )}
          </div>
          <Bar value={level.level_xp} max={level.level_size_xp} label="Experiencia del nivel" />
          <p className="text-muted-foreground text-xs tabular-nums">
            {level.level_xp} / {level.level_size_xp} XP para el nivel {level.number + 1}
          </p>
        </div>

        <div
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
        </div>
      </div>

      <div className="bg-card ring-foreground/10 space-y-3 rounded-xl p-4 ring-1">
        <h3 className="eyebrow">Misiones de la semana</h3>
        <ul className="space-y-3">
          {missions.map((mission) => (
            <li key={mission.kind} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className={cn('flex items-center gap-1.5', mission.done && 'text-primary')}>
                  {mission.done && <CheckIcon className="size-4" aria-hidden />}
                  {MISSION_LABELS[mission.kind](mission.target)}
                  {mission.done && <span className="sr-only"> (cumplida)</span>}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {Math.min(mission.progress, mission.target)}/{mission.target}
                </span>
              </div>
              <Bar
                value={mission.progress}
                max={mission.target}
                label={MISSION_LABELS[mission.kind](mission.target)}
              />
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">Cada misión cumplida da 30 XP.</p>
      </div>

      <div className="bg-card ring-foreground/10 space-y-3 rounded-xl p-4 ring-1">
        <h3 className="eyebrow">
          Insignias · {earned}/{badges.length}
        </h3>
        <ul className="grid grid-cols-4 gap-2">
          {badges.map((badge) => {
            const unlocked = badge.earned_on !== null
            return (
              <li key={badge.kind} className="flex flex-col items-center gap-1 text-center">
                <span
                  className={cn(
                    'flex size-11 items-center justify-center rounded-full',
                    unlocked ? 'bg-chart-4/15 text-chart-4' : 'bg-muted text-muted-foreground/60',
                  )}
                >
                  {unlocked ? (
                    <AwardIcon className="size-5" aria-hidden />
                  ) : (
                    <LockIcon className="size-4" aria-hidden />
                  )}
                </span>
                <span
                  className={cn(
                    'text-[11px] leading-tight',
                    unlocked ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {BADGE_LABELS[badge.kind]}
                  {!unlocked && <span className="sr-only"> (bloqueada)</span>}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
