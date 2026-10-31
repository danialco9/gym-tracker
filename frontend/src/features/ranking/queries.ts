import { useQuery } from '@tanstack/react-query'
import { progressKeys } from '@/features/progress/queries'
import { apiFetch } from '@/lib/api'
import type { ExerciseRanking, MyRanking, Zone, ZoneRanking } from '@/lib/types'

// Under the progress keys, so saving a workout or a body weight refreshes the ranking too.
export const rankingKeys = {
  all: [...progressKeys.all, 'ranking'] as const,
  mine: [...progressKeys.all, 'ranking', 'mine'] as const,
  zone: (zone: Zone) => [...progressKeys.all, 'ranking', 'zone', zone] as const,
  exercise: (exerciseId: number) => [...progressKeys.all, 'ranking', 'exercise', exerciseId] as const,
}

/** The user's tier in every zone and every ranked exercise they have done. */
export function useMyRanking() {
  return useQuery({
    queryKey: rankingKeys.mine,
    queryFn: ({ signal }) => apiFetch<MyRanking>('/ranking/zones', { signal }),
  })
}

export function useZoneRanking(zone: Zone) {
  return useQuery({
    queryKey: rankingKeys.zone(zone),
    queryFn: ({ signal }) => apiFetch<ZoneRanking>(`/ranking/zones/${zone}`, { signal }),
  })
}

export function useExerciseRanking(exerciseId: number | null) {
  return useQuery({
    queryKey: rankingKeys.exercise(exerciseId ?? 0),
    queryFn: ({ signal }) => apiFetch<ExerciseRanking>(`/ranking/exercises/${exerciseId}`, { signal }),
    enabled: exerciseId !== null,
  })
}
