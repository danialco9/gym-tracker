import { useQuery } from '@tanstack/react-query'
import { progressKeys } from '@/features/progress/queries'
import { apiFetch } from '@/lib/api'
import type { ExerciseRanking, Ranking } from '@/lib/types'

// Under the progress keys, so saving a workout or a body weight refreshes the ranking too.
export const rankingKeys = {
  overall: [...progressKeys.all, 'ranking'] as const,
  exercise: (exerciseId: number) => [...progressKeys.all, 'ranking', exerciseId] as const,
}

export function useRanking() {
  return useQuery({
    queryKey: rankingKeys.overall,
    queryFn: ({ signal }) => apiFetch<Ranking>('/ranking', { signal }),
  })
}

export function useExerciseRanking(exerciseId: number | null) {
  return useQuery({
    queryKey: rankingKeys.exercise(exerciseId ?? 0),
    queryFn: ({ signal }) => apiFetch<ExerciseRanking>(`/ranking/exercises/${exerciseId}`, { signal }),
    enabled: exerciseId !== null,
  })
}
