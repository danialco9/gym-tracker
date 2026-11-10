import { useQuery } from '@tanstack/react-query'
import { progressKeys } from '@/features/progress/queries'
import { apiFetch } from '@/lib/api'
import type { MyRanking } from '@/lib/types'

// Under the progress keys, so saving a workout or a body weight refreshes the ranking too.
export const rankingKeys = {
  all: [...progressKeys.all, 'ranking'] as const,
  mine: [...progressKeys.all, 'ranking', 'mine'] as const,
}

/** The user's tier in every zone and every ranked exercise they have done. */
export function useMyRanking() {
  return useQuery({
    queryKey: rankingKeys.mine,
    queryFn: ({ signal }) => apiFetch<MyRanking>('/ranking/zones', { signal }),
  })
}
