import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatDecimal, formatKg } from '@/lib/format'
import { BAR_CHOICES_KG, gymOf, PLATE_SIZES_KG } from '@/lib/plates'
import type { User } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useUpdateGym } from './queries'

/**
 * The bar and plates of the user's gym, for the plate calculator of the workout screen: one choice
 * for the bar, and a toggle per plate size.
 */
export function GymForm({ user, onDone }: { user: User; onDone: () => void }) {
  const update = useUpdateGym()
  const gym = gymOf(user)
  const [barKg, setBarKg] = useState(gym.barKg)
  const [platesKg, setPlatesKg] = useState<ReadonlySet<number>>(new Set(gym.platesKg))

  const toggle = (plate: number) =>
    setPlatesKg((current) => {
      const next = new Set(current)
      if (!next.delete(plate)) {
        next.add(plate)
      }
      return next
    })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    update.mutate(
      { bar_kg: barKg, plates_kg: PLATE_SIZES_KG.filter((plate) => platesKg.has(plate)) },
      {
        onSuccess: () => {
          toast.success('Barra y discos guardados.')
          onDone()
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4 px-3 pb-3">
      <div className="space-y-2">
        <p id="bar-label" className="text-sm font-medium">
          Barra
        </p>
        <div
          role="radiogroup"
          aria-labelledby="bar-label"
          className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1"
        >
          {BAR_CHOICES_KG.map((choice) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={barKg === choice}
              onClick={() => setBarKg(choice)}
              className={cn(
                'h-10 rounded-md text-sm font-medium tabular-nums transition-colors',
                barKg === choice ? 'bg-background shadow' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {formatKg(choice)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p id="plates-label" className="text-sm font-medium">
          Discos de tu gimnasio
        </p>
        <div role="group" aria-labelledby="plates-label" className="grid grid-cols-5 gap-1.5">
          {PLATE_SIZES_KG.map((plate) => (
            <button
              key={plate}
              type="button"
              aria-pressed={platesKg.has(plate)}
              aria-label={`Disco de ${formatKg(plate)}`}
              onClick={() => toggle(plate)}
              className={cn(
                'h-10 rounded-full text-sm font-medium tabular-nums ring-1 transition-colors',
                platesKg.has(plate)
                  ? 'bg-primary text-primary-foreground ring-primary'
                  : 'text-muted-foreground ring-foreground/15 hover:text-foreground',
              )}
            >
              {formatDecimal(plate)}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          Marca los que hay, en kilos. Con ellos la app te dice qué poner a cada lado de la barra.
        </p>
      </div>

      {update.error !== null && (
        <Alert variant="destructive">
          <AlertDescription>No se pudo guardar. Prueba otra vez en un rato.</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="flex-1" disabled={platesKg.size === 0 || update.isPending}>
          {update.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
