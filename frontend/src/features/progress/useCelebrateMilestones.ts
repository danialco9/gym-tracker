import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import type { Milestone } from '@/lib/types'
import { celebration } from './milestones'
import { progressKeys } from './queries'

// Long enough to read on the way out of the gym.
const CELEBRATION_MS = 8000

/**
 * After a workout is saved, celebrates the milestones it earned. Tied to that save, so each one shows
 * once. A failure stays quiet: the workout is saved, and the milestones are still in Progreso.
 */
export function useCelebrateMilestones() {
  const queryClient = useQueryClient()
  return async (workoutId: number) => {
    try {
      const milestones = await queryClient.fetchQuery({
        queryKey: progressKeys.milestones,
        queryFn: ({ signal }) => apiFetch<Milestone[]>('/progress/milestones', { signal }),
        staleTime: 0,
      })
      const message = celebration(milestones, workoutId)
      if (message !== null) {
        toast(message.title, { description: message.description, icon: '⭐', duration: CELEBRATION_MS })
      }
    } catch {
      // Nothing to tell.
    }
  }
}
