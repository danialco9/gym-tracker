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

/** Brushed silver for the muscles with nothing to show yet. */
const NEUTRAL = '#8a929d'
/** The parts that are no muscle (head, neck, knees): dark, outlined by the white silhouette. */
const BARE = '#16191e'
/** The white of the silhouette and of the seams between muscles. */
const SEAM = '#f4f6fa'

function Figure({ shapes, caption, lookOf, onSelect }: FigureProps) {
  const id = useId()
  const looks = shapes.map((shape) =>
    shape.muscle === null ? null : lookOf({ ...shape, muscle: shape.muscle }),
  )
  const colorOf = (index: number) => (shapes[index].muscle === null ? null : (looks[index]?.color ?? NEUTRAL))
  const colors = [...new Set(shapes.flatMap((_, index) => colorOf(index) ?? []))]
  const gradient = (color: string) => `${id}-${colors.indexOf(color)}`

  return (
    <figure className="flex min-w-0 flex-1 flex-col items-center gap-3">
      <svg viewBox="-2 -2 104 208" className="h-auto w-full overflow-visible" aria-hidden>
        <defs>
          {/* Diagonal bands of light across the whole figure, so the muscles read as polished metal. */}
          {colors.map((color) => (
            <linearGradient
              key={color}
              id={gradient(color)}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="16"
              y2="12"
              spreadMethod="repeat"
            >
              <stop offset="0%" stopColor={shade(color, -0.18)} />
              <stop offset="38%" stopColor={color} />
              <stop offset="50%" stopColor={shade(color, 0.55)} />
              <stop offset="62%" stopColor={color} />
              <stop offset="100%" stopColor={shade(color, -0.18)} />
            </linearGradient>
          ))}
        </defs>
        {/*
         * The silhouette: every shape outlined in white with a thick stroke, which closes the gaps between
         * them. The muscles drawn on top leave those gaps as white seams, and the stroke as an outline.
         * Inside it is dark, so a dimmed muscle fades into the dark rather than into the white.
         */}
        <g style={{ filter: 'drop-shadow(0 0 2px rgba(255, 255, 255, 0.45))' }}>
          {shapes.map((shape, index) => (
            <polygon
              key={index}
              points={shape.points}
              fill={BARE}
              stroke={SEAM}
              strokeWidth={2.6}
              strokeLinejoin="round"
            />
          ))}
        </g>
        {shapes.map((shape, index) => {
          const look = looks[index]
          const color = colorOf(index)
          const selectable = look?.selectable === true && onSelect !== undefined
          const glows = look?.color != null && !look.dimmed
          return (
            <polygon
              key={index}
              points={shape.points}
              data-zone={shapeZone(shape) ?? undefined}
              data-muscle={shape.muscle ?? undefined}
              fill={color === null ? BARE : `url(#${gradient(color)})`}
              style={glows ? { filter: `drop-shadow(0 0 1.4px ${look.color}aa)` } : undefined}
              className={cn(
                'transition-opacity duration-300',
                look?.dimmed && 'opacity-35',
                selectable && 'cursor-pointer',
              )}
              stroke={SEAM}
              strokeWidth={0.7}
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
