import { ChevronRightIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { QueryStatus } from '@/components/QueryStatus'
import { Button } from '@/components/ui/button'
import { plural } from '@/lib/format'
import type { PlannedSet, Routine } from '@/lib/types'
import { DailyPlan } from './DailyPlan'
import { DictateWorkout } from './DictateWorkout'
import type { DictatedEntry } from './draft'
import { useRoutines } from './queries'

interface StartWorkoutProps {
  onStart: (routine?: Routine, suggestions?: ReadonlyMap<number, PlannedSet[]>) => void
  onStartDictated: (entries: DictatedEntry[]) => void
}

export function StartWorkout({ onStart, onStartDictated }: StartWorkoutProps) {
  const routines = useRoutines()
  // A routine opens today's plan first: one decision per screen, then the workout.
  const [chosen, setChosen] = useState<Routine | null>(null)

  if (chosen !== null) {
    return (
      <DailyPlan
        routine={chosen}
        onStart={(suggestions) => onStart(chosen, suggestions)}
        onBack={() => setChosen(null)}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Entrenar"
        title="Nuevo entreno"
        description="Elige una rutina o empieza un entreno libre."
      />

      <Button size="lg" className="h-12 w-full text-base sm:w-auto sm:px-8" onClick={() => onStart()}>
        <PlusIcon />
        Entreno libre
      </Button>

      <DictateWorkout onStart={onStartDictated} />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="eyebrow">Tus rutinas</h2>
          <Link to="/rutinas" className="text-primary text-sm font-medium underline-offset-4 hover:underline">
            Gestionar
          </Link>
        </div>
        <QueryStatus
          query={routines}
          loading="Cargando rutinas…"
          error="No se pudieron cargar las rutinas."
        />
        {routines.data?.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Aún no tienes rutinas.{' '}
            <Link to="/rutinas/nueva" className="text-primary font-medium underline-offset-4 hover:underline">
              Crea tu primera rutina
            </Link>{' '}
            o empieza un entreno libre.
          </p>
        )}
        <ul className="grid gap-3 lg:grid-cols-2">
          {routines.data?.map((routine) => (
            <li key={routine.id} className="min-w-0">
              <button
                type="button"
                onClick={() => setChosen(routine)}
                className="bg-card ring-foreground/10 hover:bg-accent hover:ring-primary/40 flex h-full w-full items-center justify-between rounded-xl p-4 text-left ring-1 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{routine.name}</span>
                  <span className="text-muted-foreground text-sm">
                    {routine.exercises.length} {plural(routine.exercises.length, 'ejercicio', 'ejercicios')}
                  </span>
                </span>
                <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
