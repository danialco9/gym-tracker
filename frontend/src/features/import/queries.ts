import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type ImportSource = 'gym_tracker' | 'strong' | 'hevy'

export interface ImportOption {
  id: number
  name: string
}

/** A name in the file. `exercise_id` is null when it matched nothing for sure: the user picks it. */
export interface ImportExercise {
  name: string
  sets: number
  exercise_id: number | null
  suggestions: ImportOption[]
}

export interface ImportPreview {
  source: ImportSource
  /** Only the workouts not already in the account; `duplicates` counts the others. */
  workouts: number
  sets: number
  duplicates: number
  skipped_rows: number
  first_date: string | null
  last_date: string | null
  exercises: ImportExercise[]
}

export interface ImportResult {
  workouts: number
  sets: number
  duplicates: number
}

export interface ImportIn {
  content: string
  /** The user's choice for each name in the file that matched nothing. */
  exercise_ids: Record<string, number>
}

/** Under the API's limit, itself under the 4.5 MB a request can carry. */
export const MAX_IMPORT_CHARS = 4_000_000

/** Reads the file on the server and says what it holds. Saves nothing. */
export function usePreviewImport() {
  return useMutation({
    mutationFn: (content: string) =>
      apiFetch<ImportPreview>('/import/workouts/preview', { method: 'POST', body: { content } }),
  })
}

export function useImportWorkouts() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ImportIn) =>
      apiFetch<ImportResult>('/import/workouts', { method: 'POST', body: payload }),
    // History, progress, ranking, streak and the calendar all change with the old workouts.
    onSuccess: () => queryClient.invalidateQueries(),
  })
}
