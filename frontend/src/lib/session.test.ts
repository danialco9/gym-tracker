import { beforeEach, expect, test } from 'vitest'
import { loadCachedUser, saveCachedUser, SESSION_STORAGE_KEY } from '@/lib/session'

const user = {
  id: 1,
  email: 'dani@example.com',
  goal: 'build_muscle',
  nickname: 'Tigre',
  sex: null,
  show_in_ranking: false,
  created_at: '2026-09-01T10:00:00+00:00',
} as const

beforeEach(() => {
  window.localStorage.clear()
})

test('remembers the confirmed user across reloads', () => {
  saveCachedUser(user)

  expect(loadCachedUser()).toEqual(user)
})

test('forgets the user when the session ends', () => {
  saveCachedUser(user)
  saveCachedUser(null)

  expect(loadCachedUser()).toBeNull()
})

test('reads a user cached before goals existed as having none yet', () => {
  const { goal: _, ...withoutGoal } = user
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(withoutGoal))

  expect(loadCachedUser()).toEqual({ ...withoutGoal, goal: null })
})

test('reads a user cached before the ranking existed as unnamed and listed', () => {
  const { nickname: _, show_in_ranking: __, ...beforeRanking } = user
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(beforeRanking))

  expect(loadCachedUser()).toEqual({ ...beforeRanking, nickname: null, show_in_ranking: true })
})

test('ignores anything that is not a user', () => {
  window.localStorage.setItem(SESSION_STORAGE_KEY, '{"id":"not a number"}')

  expect(loadCachedUser()).toBeNull()
})
