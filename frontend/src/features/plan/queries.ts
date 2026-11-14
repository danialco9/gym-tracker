import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { PlanKind, PlannedDay, WeekPlan } from '@/lib/types'

export const planKeys = {
  all: ['plan'] as const,
  /** `start` is any day of the week; null is the current one. */
  week: (start: string | null) => ['plan', 'week', start] as const,
  usualWeek: ['plan', 'days'] as const,
}

export function useWeekPlan(start: string | null) {
  return useQuery({
    queryKey: planKeys.week(start),
    queryFn: ({ signal }) =>
      apiFetch<WeekPlan>(start === null ? '/plan/week' : `/plan/week?start=${start}`, { signal }),
    // Keeps the week on screen while the next one loads, instead of an empty card.
    placeholderData: (previous) => previous,
  })
}

export function useUsualWeek() {
  return useQuery({
    queryKey: planKeys.usualWeek,
    queryFn: ({ signal }) => apiFetch<PlannedDay[]>('/plan/days', { signal }),
  })
}

/** What a day can hold: a routine (by id), a free workout or rest. */
export interface DayChoice {
  kind: PlanKind
  routineId: number | null
}

/** Every change refetches the whole plan: one change can show in two weeks, or in every week. */
function usePlanMutation<T>(mutationFn: (variables: T) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planKeys.all }),
  })
}

/** What one date holds instead of the usual week. */
export function useChangeDay() {
  return usePlanMutation(({ date, choice }: { date: string; choice: DayChoice }) =>
    apiFetch<WeekPlan>(`/plan/changes/${date}`, {
      method: 'PUT',
      body: { kind: choice.kind, routine_id: choice.routineId },
    }),
  )
}

/** Back to what the usual week holds on that date. */
export function useUndoChange() {
  return usePlanMutation((date: string) => apiFetch<WeekPlan>(`/plan/changes/${date}`, { method: 'DELETE' }))
}

export function useMoveDay() {
  return usePlanMutation(({ from, to }: { from: string; to: string }) =>
    apiFetch<WeekPlan>('/plan/move', { method: 'POST', body: { from_date: from, to_date: to } }),
  )
}

/** Sets what one weekday holds every week, keeping the rest of the usual week as it is. */
export function useSetUsualDay() {
  return usePlanMutation(
    ({ usualWeek, weekday, choice }: { usualWeek: PlannedDay[]; weekday: number; choice: DayChoice }) => {
      const others = usualWeek.filter((day) => day.weekday !== weekday)
      const days = choice.kind === 'rest' ? others : [...others, { weekday, routine_id: choice.routineId }]
      return apiFetch<PlannedDay[]>('/plan/days', { method: 'PUT', body: { days } })
    },
  )
}
