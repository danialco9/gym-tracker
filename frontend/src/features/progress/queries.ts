import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { ExerciseProgress, ProgressOverview } from '@/lib/types'

// Derived from workouts and measurements, so saving either should refresh it.
export const progressKeys = {
  all: ['progress'] as const,
  overview: ['progress', 'overview'] as const,
  goals: ['progress', 'goals'] as const,
  exercise: (exerciseId: number) => ['progress', 'exercises', exerciseId] as const,
}

export function useProgressOverview() {
  return useQuery({
    queryKey: progressKeys.overview,
    queryFn: ({ signal }) => apiFetch<ProgressOverview>('/progress/overview', { signal }),
  })
}

export function useExerciseProgress(exerciseId: number | null) {
  return useQuery({
    queryKey: progressKeys.exercise(exerciseId ?? 0),
    queryFn: ({ signal }) => apiFetch<ExerciseProgress>(`/progress/exercises/${exerciseId}`, { signal }),
    enabled: exerciseId !== null,
  })
}
