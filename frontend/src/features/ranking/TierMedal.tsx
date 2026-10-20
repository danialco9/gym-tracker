import { ShieldIcon } from 'lucide-react'
import { STRENGTH_TIERS } from '@/lib/labels'
import type { StrengthTier } from '@/lib/types'
import { cn } from '@/lib/utils'

/** A shield in the tier's colour; the name goes beside it, so the shield itself is decoration. */
export function TierMedal({ tier, className }: { tier: StrengthTier; className?: string }) {
  const { color } = STRENGTH_TIERS[tier]
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-full', className)}
      style={{ backgroundColor: `${color}26`, color }}
      aria-hidden
    >
      <ShieldIcon className="size-[55%]" fill="currentColor" fillOpacity={0.35} />
    </span>
  )
}
