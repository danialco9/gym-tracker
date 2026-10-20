import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { currentUserQueryKey } from '@/features/auth/queries'
import { progressKeys } from '@/features/progress/queries'
import { apiFetch } from '@/lib/api'
import { saveCachedUser } from '@/lib/session'
import type { GoalPlan, TrainingGoal, User } from '@/lib/types'

/** The plan of every goal. Fixed on the server, so it is fetched once per visit. */
export function useGoalPlans() {
  return useQuery({
    queryKey: progressKeys.goals,
    queryFn: ({ signal }) => apiFetch<GoalPlan[]>('/progress/goals', { signal }),
    staleTime: Infinity,
  })
}

export function useUpdateGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (goal: TrainingGoal | null) =>
      apiFetch<User>('/auth/me', { method: 'PATCH', body: { goal } }),
    onSuccess: (user) => {
      saveCachedUser(user)
      queryClient.setQueryData(currentUserQueryKey, user)
      // The weekly volume advice is judged against the goal's range. Not awaited: the new goal is
      // already saved, so the screen can move on while the overview reloads.
      void queryClient.invalidateQueries({ queryKey: progressKeys.overview })
    },
  })
}
