import { useId } from 'react'
import { cn } from '@/lib/utils'
import { BACK_SHAPES, type BodyShape, FRONT_SHAPES, shapeZone } from './body-shapes'

/** How one muscle shape is painted. */
export interface ShapeLook {
  /** A `#rrggbb` fill; null paints the muscle in neutral grey. */
  color: string | null
  dimmed?: boolean
  /** Whether tapping it calls `onSelect`. */
  selectable?: boolean
}

/** ``hex`` mixed with white (amount > 0) or black (amount < 0). */
function shade(hex: string, amount: number): string {
  const target = amount > 0 ? 255 : 0
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16))
  const mixed = channels.map((value) => Math.round(value + (target - value) * Math.abs(amount)))
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

interface FigureProps {
  shapes: BodyShape[]
  caption: string
  /** Null paints the muscle as a part with nothing to show, like the head. */
  lookOf: (shape: BodyShape & { muscle: NonNullable<BodyShape['muscle']> }) => ShapeLook | null
  onSelect?: (shape: BodyShape) => void
}

function Figure({ shapes, caption, lookOf, onSelect }: FigureProps) {
  const id = useId()
  const looks = shapes.map((shape) =>
    shape.muscle === null ? null : lookOf({ ...shape, muscle: shape.muscle }),
  )
  const colors = [...new Set(looks.flatMap((look) => (look?.color ? [look.color] : [])))]
  const gradient = (color: string) => `${id}-${colors.indexOf(color)}`

  return (
    <figure className="flex min-w-0 flex-1 flex-col items-center gap-3">
      <svg viewBox="-2 -2 104 208" className="h-auto w-full overflow-visible" aria-hidden>
        <defs>
          {colors.map((color) => (
            <linearGradient key={color} id={gradient(color)} x1="0" y1="0" x2="0.35" y2="1">
              <stop offset="0%" stopColor={shade(color, 0.35)} />
              <stop offset="55%" stopColor={color} />
              <stop offset="100%" stopColor={shade(color, -0.25)} />
            </linearGradient>
          ))}
        </defs>
        {shapes.map((shape, index) => {
          const look = looks[index]
          const color = look?.color ?? null
          const selectable = look?.selectable === true && onSelect !== undefined
          return (
            <polygon
              key={index}
              points={shape.points}
              data-zone={shapeZone(shape) ?? undefined}
              data-muscle={shape.muscle ?? undefined}
              fill={color === null ? undefined : `url(#${gradient(color)})`}
              style={
                color === null || look?.dimmed ? undefined : { filter: `drop-shadow(0 0 1.6px ${color}99)` }
              }
              className={cn(
                'stroke-card transition-opacity duration-300',
                look === null ? 'fill-muted-foreground/20' : color === null && 'fill-muted-foreground/35',
                look?.dimmed && 'opacity-35',
                selectable && 'cursor-pointer',
              )}
              strokeWidth={0.6}
              strokeLinejoin="round"
              onClick={selectable ? () => onSelect(shape) : undefined}
            />
          )
        })}
      </svg>
      <figcaption className="text-muted-foreground text-[0.7rem] tracking-widest uppercase">
        {caption}
      </figcaption>
    </figure>
  )
}

/**
 * The body from the front and the back, one shape per muscle, each painted as `lookOf` says. The
 * drawing is hidden from screen readers: `label` must say what it shows.
 */
export function BodyFigures({
  label,
  lookOf,
  onSelect,
  className,
}: Omit<FigureProps, 'shapes' | 'caption'> & { label: string; className?: string }) {
  return (
    <div role="img" aria-label={label} className={cn('flex gap-4', className)}>
      <Figure shapes={FRONT_SHAPES} caption="Frente" lookOf={lookOf} onSelect={onSelect} />
      <Figure shapes={BACK_SHAPES} caption="Espalda" lookOf={lookOf} onSelect={onSelect} />
    </div>
  )
}
