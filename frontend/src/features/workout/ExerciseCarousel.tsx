import { useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import { cn } from 'cn'
import type { DraftExercise } from './draft'

export interface ExerciseCarouselHandle {
  /** Brings an exercise into view, e.g. the next one or one just added. */
  show: (index: number) => void
}

interface ExerciseCarouselProps {
  exercises: DraftExercise[]
  children: (entry: DraftExercise) => ReactNode
  ref?: Ref<ExerciseCarouselHandle>
}

/**
 * One exercise per screen, swiped sideways with CSS scroll snapping: no gesture library, and the
 * browser keeps the native momentum. The dots below say where you are and jump to any exercise.
 */
export function ExerciseCarousel({ exercises, children, ref }: ExerciseCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)
  // An exercise removed from the end would leave the index pointing past the last one.
  const shown = Math.min(current, exercises.length - 1)

  const show = (index: number) => {
    setCurrent(index)
    const scroller = scrollerRef.current
    scroller?.scrollTo?.({ left: index * scroller.clientWidth, behavior: 'smooth' })
  }
  useImperativeHandle(ref, () => ({ show }))

  const followScroll = () => {
    const scroller = scrollerRef.current
    if (scroller !== null && scroller.clientWidth > 0) {
      setCurrent(Math.round(scroller.scrollLeft / scroller.clientWidth))
    }
  }

  return (
    <div className="space-y-3">
      <div
        ref={scrollerRef}
        onScroll={followScroll}
        className="flex snap-x snap-mandatory [scrollbar-width:none] items-start overflow-x-auto overscroll-x-contain"
      >
        {exercises.map((entry, index) => (
          <section
            key={entry.id}
            aria-label={`Ejercicio ${index + 1} de ${exercises.length}`}
            // px-px keeps the card's border from being clipped by the scroller.
            className="w-full shrink-0 snap-center snap-always px-px"
          >
            {children(entry)}
          </section>
        ))}
      </div>

      <nav aria-label="Ejercicios" className="flex flex-wrap items-center justify-center gap-x-1.5">
        {exercises.map((entry, index) => {
          const finished = entry.sets.length > 0 && entry.sets.every((set) => set.done)
          return (
            <button
              key={entry.id}
              type="button"
              aria-label={`Ir a ${entry.name}`}
              aria-current={index === shown ? 'step' : undefined}
              onClick={() => show(index)}
              // A finger-sized target around a small dot.
              className="flex h-8 items-center px-1"
            >
              <span
                className={cn(
                  'block h-2 rounded-full transition-all',
                  index === shown && 'bg-primary w-6',
                  index !== shown && (finished ? 'bg-primary/60 w-2' : 'bg-muted-foreground/30 w-2'),
                )}
              />
            </button>
          )
        })}
      </nav>
    </div>
  )
}
