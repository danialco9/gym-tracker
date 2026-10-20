import { ActiveWorkout } from './ActiveWorkout'
import { StartWorkout } from './StartWorkout'
import { useWorkoutDraft } from './useWorkoutDraft'

export function WorkoutPage() {
  const [draft, dispatch] = useWorkoutDraft()

  if (draft === null) {
    return (
      <StartWorkout
        onStart={(routine, suggestions) =>
          dispatch({ type: 'start', startedAt: new Date().toISOString(), routine, suggestions })
        }
        onStartDictated={(entries) =>
          dispatch({ type: 'startDictated', startedAt: new Date().toISOString(), entries })
        }
      />
    )
  }
  return <ActiveWorkout draft={draft} dispatch={dispatch} />
}
