import { useEffect, useState } from 'react'
import { cn } from 'cn'

const FRAME_MS = 650
// Start, middle, end, middle: the movement goes there and back instead of jumping to the start.
const SEQUENCE = [0, 1, 2, 1]

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

interface MovementAnimationProps {
  /** The three frames from exerciseFrameUrls. */
  frames: string[]
  /** Size and shape of the box; the frames fill it. */
  className?: string
}

/** Cycles through the frames. All of them are mounted at once, so the loop never waits on a download. */
export function MovementAnimation({ frames, className }: MovementAnimationProps) {
  const [step, setStep] = useState(0)
  const [animate] = useState(() => !prefersReducedMotion())

  useEffect(() => {
    if (!animate) {
      return
    }
    const timer = window.setInterval(() => setStep((current) => (current + 1) % SEQUENCE.length), FRAME_MS)
    return () => window.clearInterval(timer)
  }, [animate])

  // With reduced motion the middle frame stays put: it is the most recognisable one.
  const visible = animate ? SEQUENCE[step] : 1

  return (
    <div
      role="img"
      aria-label="Dibujo del movimiento"
      className={cn('bg-muted relative overflow-hidden', className)}
    >
      {frames.map((src, index) => (
        <img
          key={src}
          src={src}
          alt=""
          className={cn('absolute inset-0 size-full object-contain p-[6%]', index !== visible && 'opacity-0')}
        />
      ))}
    </div>
  )
}
