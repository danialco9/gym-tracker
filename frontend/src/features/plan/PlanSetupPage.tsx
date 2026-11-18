import { CalendarDaysIcon, CheckIcon, SparklesIcon, TriangleAlertIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useNavigate } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { QueryStatus } from '@/components/QueryStatus'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useUsualWeek } from './queries'
import { MAX_PRESET_DAYS, useApplyPresets, useFreeWeek, usePresetPreview } from './setup-queries'
import { hasBackToBackDays, WEEKDAY_LETTERS, WEEKDAY_NAMES } from './week-dates'

type Mode = 'presets' | 'free'

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function ModeOption({
  selected,
  disabled = false,
  icon,
  title,
  children,
  onSelect,
}: {
  selected: boolean
  disabled?: boolean
  icon: ReactNode
  title: string
  children: ReactNode
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl p-4 text-left ring-1 transition-colors disabled:opacity-50',
        selected ? 'bg-primary/10 ring-primary' : 'bg-card ring-foreground/10 hover:bg-accent',
      )}
    >
      <span className="text-primary mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 space-y-1">
        <span className="block font-medium">{title}</span>
        <span className="text-muted-foreground block text-sm">{children}</span>
      </span>
    </button>
  )
}

function PresetPreview({ weekdays }: { weekdays: number[] }) {
  const preview = usePresetPreview(weekdays)
  const fullBody = weekdays.length <= 3
  return (
    <section className="space-y-3">
      <h2 className="eyebrow">Así queda tu semana</h2>
      {fullBody && hasBackToBackDays(weekdays) && (
        <Alert>
          <TriangleAlertIcon />
          <AlertDescription>
            Con {weekdays.length === 1 ? 'una rutina' : 'rutinas'} de cuerpo completo conviene descansar un
            día entre sesiones: prueba, por ejemplo, lunes, miércoles y viernes.
          </AlertDescription>
        </Alert>
      )}
      <QueryStatus query={preview} loading="Preparando tu semana…" error="No se pudo preparar la semana." />
      <ol className="space-y-2">
        {preview.data?.map((day) => (
          <li key={day.weekday} className="bg-card ring-foreground/10 rounded-xl p-3 ring-1">
            <p className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{capitalize(WEEKDAY_NAMES[day.weekday])}</span>
              <span className="text-primary text-sm font-medium">{day.name}</span>
            </p>
            <p className="text-muted-foreground mt-1 text-xs">{day.exercises.join(' · ')}</p>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground text-xs">
        Se copian a tus rutinas con 3 series por ejercicio, así que puedes editarlas cuando quieras. Si ya
        tienes una con el mismo nombre, se usa la tuya.
      </p>
    </section>
  )
}

/**
 * Sets up the usual week: the days someone trains, and either the ready-made split laid on them,
 * so each muscle rests between sessions, or a free workout on each.
 */
export function PlanSetupPage() {
  const navigate = useNavigate()
  const usualWeek = useUsualWeek()
  const applyPresets = useApplyPresets()
  const freeWeek = useFreeWeek()
  // Starts from the current usual week, once it is there.
  const [picked, setPicked] = useState<number[] | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)
  const weekdays = picked ?? usualWeek.data?.map((day) => day.weekday) ?? []
  const tooManyForPresets = weekdays.length > MAX_PRESET_DAYS
  const chosenMode = mode === 'presets' && tooManyForPresets ? null : mode
  const saving = applyPresets.isPending || freeWeek.isPending
  const failed = applyPresets.isError || freeWeek.isError

  const toggle = (weekday: number) =>
    setPicked(
      weekdays.includes(weekday)
        ? weekdays.filter((other) => other !== weekday)
        : [...weekdays, weekday].toSorted((a, b) => a - b),
    )

  const save = () => {
    const options = { onSuccess: () => void navigate('/') }
    if (chosenMode === 'presets') {
      applyPresets.mutate(weekdays, options)
    } else if (chosenMode === 'free') {
      freeWeek.mutate(weekdays, options)
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        eyebrow="Tu semana"
        title="Planifica tu semana"
        description="Elige qué días entrenas y cómo quieres organizarlos. Luego puedes cambiar cualquier día."
      />

      <section className="space-y-3">
        <h2 className="eyebrow">¿Qué días vas al gimnasio?</h2>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_LETTERS.map((letter, weekday) => {
            const on = weekdays.includes(weekday)
            return (
              <button
                key={letter}
                type="button"
                aria-pressed={on}
                aria-label={capitalize(WEEKDAY_NAMES[weekday])}
                onClick={() => toggle(weekday)}
                className={cn(
                  'font-heading grid h-12 place-items-center rounded-xl text-base font-medium ring-1 transition-colors',
                  on
                    ? 'bg-primary text-primary-foreground ring-primary'
                    : 'bg-card ring-foreground/10 hover:bg-accent',
                )}
              >
                {letter}
              </button>
            )
          })}
        </div>
        <p className="text-muted-foreground text-sm">
          {weekdays.length === 0
            ? 'Toca los días que sueles entrenar.'
            : `${weekdays.length} ${weekdays.length === 1 ? 'día' : 'días'} a la semana.`}
        </p>
      </section>

      {weekdays.length > 0 && (
        <section className="space-y-3">
          <h2 className="eyebrow">¿Cómo quieres organizarla?</h2>
          <ModeOption
            selected={chosenMode === 'presets'}
            disabled={tooManyForPresets}
            icon={<SparklesIcon className="size-5" />}
            title="Prepárame las rutinas"
            onSelect={() => setMode('presets')}
          >
            {tooManyForPresets
              ? 'Para usarlas deja al menos un día de descanso: los músculos crecen al recuperarse.'
              : 'Te reparto rutinas por grupos musculares para que cada uno descanse entre sesiones.'}
          </ModeOption>
          <ModeOption
            selected={chosenMode === 'free'}
            icon={<CalendarDaysIcon className="size-5" />}
            title="Entreno libre"
            onSelect={() => setMode('free')}
          >
            Cada día queda como entreno libre. Luego puedes asignarle tus propias rutinas desde Inicio.
          </ModeOption>
        </section>
      )}

      {chosenMode === 'presets' && <PresetPreview weekdays={weekdays} />}

      {(usualWeek.data?.length ?? 0) > 0 && chosenMode !== null && (
        <p className="text-muted-foreground text-xs">
          Sustituye tu semana actual. Los cambios que hiciste en días concretos se mantienen.
        </p>
      )}

      {failed && (
        <Alert variant="destructive">
          <AlertDescription>No se pudo guardar. Revisa la conexión e inténtalo de nuevo.</AlertDescription>
        </Alert>
      )}

      {/* Above the bottom navigation, so it stays in reach however long the preview gets. */}
      <div className="bg-background/95 fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t px-4 py-3 backdrop-blur lg:sticky lg:bottom-0 lg:-mx-2 lg:px-2">
        <Button
          size="lg"
          className="mx-auto flex h-14 w-full max-w-2xl text-base font-semibold"
          disabled={weekdays.length === 0 || chosenMode === null || saving}
          onClick={save}
        >
          <CheckIcon />
          {saving ? 'Guardando…' : 'Guardar mi semana'}
        </Button>
      </div>
    </div>
  )
}
