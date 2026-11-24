import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { planKeys } from '@/features/plan/queries'
import { progressKeys } from '@/features/progress/queries'
import { apiFetch } from '@/lib/api'
import type {
  Dictation,
  Exercise,
  ExerciseIn,
  ExerciseNote,
  LastSession,
  Routine,
  Workout,
  WorkoutIn,
} from '@/lib/types'

export const queryKeys = {
  exercises: ['exercises'] as const,
  exerciseNotes: ['exercise-notes'] as const,
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

/** The workouts that began in a month (``month`` is its first day), for the calendar. */
export function useMonthWorkouts(month: string, nextMonth: string) {
  return useQuery({
    queryKey: [...queryKeys.workouts, { month }],
    queryFn: ({ signal }) =>
      apiFetch<Workout[]>(`/workouts?start=${month}&end=${nextMonth}&limit=100`, { signal }),
    // Keeps the month on screen while the next one loads.
    placeholderData: (previous) => previous,
  })
}

/** Everything a saved workout feeds: history, last sessions, progress and the week plan. */
function useRefreshAfterWorkout() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workouts }),
      queryClient.invalidateQueries({ queryKey: queryKeys.exercises }),
      queryClient.invalidateQueries({ queryKey: progressKeys.all }),
      // The week plan marks the days trained.
      queryClient.invalidateQueries({ queryKey: planKeys.all }),
    ])
}

export function useSaveWorkout() {
  const refresh = useRefreshAfterWorkout()
  return useMutation({
    mutationFn: (payload: WorkoutIn) => apiFetch<Workout>('/workouts', { method: 'POST', body: payload }),
    // By default a mutation started offline is paused until the connection returns, which would
    // leave the finish button saying "Guardando…" in a gym with no coverage. The request fails at
    // once instead, and the workout goes to the offline queue.
    networkMode: 'always',
    onSuccess: refresh,
  })
}

/** Replaces a saved workout's sets and notes, from the calendar. */
export function useUpdateWorkout() {
  const refresh = useRefreshAfterWorkout()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: WorkoutIn }) =>
      apiFetch<Workout>(`/workouts/${id}`, { method: 'PUT', body: payload }),
    // Fail at once with no connection instead of waiting paused with the button saying "Guardando…".
    networkMode: 'always',
    onSuccess: refresh,
  })
}

export function useDeleteWorkout() {
  const refresh = useRefreshAfterWorkout()
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/workouts/${id}`, { method: 'DELETE' }),
    networkMode: 'always',
    onSuccess: refresh,
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

/** Every note of the user, fetched once and shared by all the exercise cards of a workout. */
export function useExerciseNotes() {
  return useQuery({
    queryKey: queryKeys.exerciseNotes,
    queryFn: ({ signal }) => apiFetch<ExerciseNote[]>('/exercise-notes', { signal }),
    staleTime: 5 * 60_000,
  })
}

/** The note of an exercise, or "" when it has none. */
export function useExerciseNote(exerciseId: number): string {
  const notes = useExerciseNotes()
  return notes.data?.find((note) => note.exercise_id === exerciseId)?.text ?? ''
}

/** Writes the note of an exercise; an empty one deletes it. The cached list follows at once. */
export function useSaveExerciseNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ exerciseId, text }: { exerciseId: number; text: string }) =>
      apiFetch<ExerciseNote>(`/exercise-notes/${exerciseId}`, { method: 'PUT', body: { text } }),
    // Fail at once with no connection instead of waiting paused with the button saying "Guardando…".
    networkMode: 'always',
    onSuccess: (saved) => {
      queryClient.setQueryData<ExerciseNote[]>(queryKeys.exerciseNotes, (current = []) => [
        ...current.filter((note) => note.exercise_id !== saved.exercise_id),
        ...(saved.text ? [saved] : []),
      ])
    },
  })
}

/** Reads a workout written in plain text. Saves nothing: the result prefills the draft. */
export function useReadDictation() {
  return useMutation({
    mutationFn: (text: string) => apiFetch<Dictation>('/dictation', { method: 'POST', body: { text } }),
  })
}
