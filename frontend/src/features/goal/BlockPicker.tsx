import { RotateCcwIcon } from 'lucide-react'
import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { plural } from '@/lib/format'

const BLOCK_LENGTHS = [4, 5, 6] as const

function blockHint(weeks: number | null) {
  if (weeks === null) {
    return 'Entrenas igual todas las semanas.'
  }
  const building = weeks - 1
  return `${building} ${plural(building, 'semana', 'semanas')} apretando y 1 de descarga, más suave para recuperar. Luego empieza otro bloque.`
}

interface BlockPickerProps {
  /** Weeks per block as picked on screen; null for no blocks. */
  value: number | null
  onChange: (weeks: number | null) => void
  /** Shown when a block is running and unchanged on screen: starts it again this week. */
  onRestart?: () => void
  restarting?: boolean
}

/** Mesocycles: how many weeks a block lasts, its last one the deload. */
export function BlockPicker({ value, onChange, onRestart, restarting = false }: BlockPickerProps) {
  const labelId = useId()
  const options = [null, ...BLOCK_LENGTHS]

  return (
    <section aria-labelledby={labelId} className="space-y-2">
      <h2 id={labelId} className="text-muted-foreground text-sm">
        Bloques con semana de descarga
      </h2>
      {/* Toggle buttons rather than a select: one tap, and every choice in sight. */}
      <div role="group" aria-labelledby={labelId} className="grid grid-cols-4 gap-2">
        {options.map((weeks) => {
          const selected = weeks === value
          return (
            <Button
              key={weeks ?? 'none'}
              variant={selected ? 'default' : 'outline'}
              className="h-11 px-0"
              aria-pressed={selected}
              aria-label={weeks === null ? 'Sin bloques' : `Bloques de ${weeks} semanas`}
              onClick={() => onChange(weeks)}
            >
              {weeks === null ? 'No' : `${weeks} sem`}
            </Button>
          )
        })}
      </div>
      <p className="text-muted-foreground text-sm">{blockHint(value)}</p>
      {onRestart && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground -ml-2 h-8"
          onClick={onRestart}
          disabled={restarting}
        >
          <RotateCcwIcon />
          Empezar el bloque de nuevo esta semana
        </Button>
      )}
    </section>
  )
}
