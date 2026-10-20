import type { ReactNode } from 'react'

interface ProgressRingProps {
  /** Share of the ring filled, from 0 to 1. */
  value: number
  size: number
  strokeWidth: number
  children?: ReactNode
}

/** A circular progress track with its content centred inside. Decorative: the text says the same. */
export function ProgressRing({ value, size, strokeWidth, children }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const filled = Math.min(1, Math.max(0, value))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-secondary"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - filled)}
          // A round cap would still draw a dot at zero.
          opacity={filled === 0 ? 0 : 1}
          className="stroke-primary transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}
