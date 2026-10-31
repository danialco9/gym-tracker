import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { READY_SECONDS, useRestTimer } from './useRestTimer'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useRestTimer', () => {
  it('says "go" for a moment when the rest runs out by itself', () => {
    const { result } = renderHook(() => useRestTimer())

    act(() => result.current.start(10))
    act(() => vi.advanceTimersByTime(10_000))

    expect(result.current.isRunning).toBe(false)
    expect(result.current.ready).toBe(true)

    act(() => vi.advanceTimersByTime(READY_SECONDS * 1000))

    expect(result.current.ready).toBe(false)
  })

  it('goes straight away when the rest is cut short', () => {
    const { result } = renderHook(() => useRestTimer())

    act(() => result.current.start(10))
    act(() => result.current.stop())

    expect(result.current.isRunning).toBe(false)
    expect(result.current.ready).toBe(false)
  })
})
