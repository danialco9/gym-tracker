import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/features/workout/queries'
import { apiFetch } from '@/lib/api'
import type { PlannedDay, PresetDay } from '@/lib/types'
import { planKeys } from './queries'

/** The most training days the ready-made split covers: one rest day at least. */
export const MAX_PRESET_DAYS = 6

/** What the ready-made split would put on those weekdays; nothing is saved. */
export function usePresetPreview(weekdays: number[]) {
  const query = weekdays.map((weekday) => `weekdays=${weekday}`).join('&')
  return useQuery({
    queryKey: ['plan', 'presets', weekdays] as const,
    queryFn: ({ signal }) => apiFetch<PresetDay[]>(`/plan/presets?${query}`, { signal }),
    enabled: weekdays.length > 0 && weekdays.length <= MAX_PRESET_DAYS,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: (previous) => previous,
  })
}

/** Copies the ready-made routines for those days and makes them the usual week. */
export function useApplyPresets() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (weekdays: number[]) =>
      apiFetch<PlannedDay[]>('/plan/presets', { method: 'POST', body: { weekdays } }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: planKeys.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines }),
      ]),
  })
}

/** Makes those weekdays free workouts, and every other one rest. */
export function useFreeWeek() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (weekdays: number[]) =>
      apiFetch<PlannedDay[]>('/plan/days', {
        method: 'PUT',
        body: { days: weekdays.map((weekday) => ({ weekday, routine_id: null })) },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planKeys.all }),
  })
}
