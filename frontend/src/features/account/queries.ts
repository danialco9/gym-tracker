import { useMutation, useQueryClient } from '@tanstack/react-query'
import { currentUserQueryKey } from '@/features/auth/queries'
import { rankingKeys } from '@/features/ranking/queries'
import { apiFetch } from '@/lib/api'
import { saveCachedUser } from '@/lib/session'
import type { User } from '@/lib/types'

export interface FeedbackIn {
  message: string
  /** The screen the person was on before opening their account, e.g. `/entrenar`. */
  page: string | null
}

export function useSendFeedback() {
  return useMutation({
    mutationFn: (feedback: FeedbackIn) => apiFetch<void>('/feedback', { method: 'POST', body: feedback }),
  })
}

/**
 * The user's profile: the nickname the app greets them with (null clears it) and the private sex
 * their lifts are compared with (null compares with everyone).
 */
export type RankingProfile = Partial<Pick<User, 'nickname' | 'sex'>>

export function useUpdateRankingProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes: RankingProfile) => apiFetch<User>('/auth/me', { method: 'PATCH', body: changes }),
    onSuccess: (user) => {
      saveCachedUser(user)
      queryClient.setQueryData(currentUserQueryKey, user)
      // The tiers follow the sex. Not awaited, like the goal.
      void queryClient.invalidateQueries({ queryKey: rankingKeys.all })
    },
  })
}
