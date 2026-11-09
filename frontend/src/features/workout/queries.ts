import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { progressKeys } from '@/features/progress/queries'
import { apiFetch } from '@/lib/api'
import type { Dictation, Exercise, ExerciseIn, LastSession, Routine, Workout, WorkoutIn } from '@/lib/types'

export const queryKeys = {
  exercises: ['exercises'] as const,
  lastSession: (exerciseId: number) => ['exercises', exerciseId, 'last-session'] as const,
  routines: ['routines'] as const,
  workouts: ['workouts'] as const,
}

export function useExercises() {
  return useQuery({
    queryKey: queryKeys.exercises,
    queryFn: ({ signal }) => apiFetch<Exercise[]>('/exercises', { signal }),
    staleTime: 60 * 60_000,
  })
}

export function useRoutines() {
  return useQuery({
    queryKey: queryKeys.routines,
    queryFn: ({ signal }) => apiFetch<Routine[]>('/routines', { signal }),
    staleTime: 5 * 60_000,
  })
}

/** Shared by the hook and by the swap, which reads it once on the spot. */
export const lastSessionQuery = (exerciseId: number) =>
  queryOptions({
    queryKey: queryKeys.lastSession(exerciseId),
    queryFn: ({ signal }) =>
      apiFetch<LastSession | null>(`/exercises/${exerciseId}/last-session`, { signal }),
    staleTime: 5 * 60_000,
  })

export function useLastSession(exerciseId: number) {
  return useQuery(lastSessionQuery(exerciseId))
}

export function useRecentWorkouts(limit = 5) {
  return useQuery({
    queryKey: [...queryKeys.workouts, { limit }],
    queryFn: ({ signal }) => apiFetch<Workout[]>(`/workouts?limit=${limit}`, { signal }),
  })
}

export function useSaveWorkout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: WorkoutIn) => apiFetch<Workout>('/workouts', { method: 'POST', body: payload }),
    // By default a mutation started offline is paused until the connection returns, which would
    // leave the finish button saying "Guardando…" in a gym with no coverage. The request fails at
    // once instead, and the workout goes to the offline queue.
    networkMode: 'always',
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workouts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.exercises }),
        queryClient.invalidateQueries({ queryKey: progressKeys.all }),
      ]),
  })
}

/** Creates one of the user's own exercises and adds it to the cached list, so pickers show it at once. */
export function useCreateExercise() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (exercise: ExerciseIn) =>
      apiFetch<Exercise>('/exercises', { method: 'POST', body: exercise }),
    // Fail at once with no connection instead of waiting paused with the button saying "Creando…".
    networkMode: 'always',
    onSuccess: (created) => {
      queryClient.setQueryData<Exercise[]>(queryKeys.exercises, (current) => current && [...current, created])
      // Not awaited: the new exercise is already in the cache, so it can be added without waiting.
      void queryClient.invalidateQueries({ queryKey: queryKeys.exercises })
    },
  })
}

/** Reads a workout written in plain text. Saves nothing: the result prefills the draft. */
export function useReadDictation() {
  return useMutation({
    mutationFn: (text: string) => apiFetch<Dictation>('/dictation', { method: 'POST', body: { text } }),
  })
}
