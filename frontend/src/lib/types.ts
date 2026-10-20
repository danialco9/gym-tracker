// Mirrors the backend response and request schemas (backend/src/gym_tracker/schemas.py).

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'lower_back'
  | 'traps'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'adductors'
  | 'abductors'
  | 'calves'

export type Equipment =
  | 'barbell'
  | 'ez_bar'
  | 'dumbbell'
  | 'kettlebell'
  | 'machine'
  | 'smith_machine'
  | 'cable'
  | 'bodyweight'
  | 'band'

export type TrainingGoal = 'lose_fat' | 'build_muscle' | 'recomposition'

export interface User {
  id: number
  email: string
  /** Null until the user picks one; meanwhile the general advice applies. */
  goal: TrainingGoal | null
  created_at: string
}

interface Range {
  min: number
  max: number
}

/** What a training goal asks for; isolation reps are for single-joint exercises. */
export interface GoalPlan {
  goal: TrainingGoal
  compound_reps: Range
  isolation_reps: Range
  rpe: Range
  rest_seconds: Range
  weekly_hard_sets: Range
}

export type ExerciseIn = Pick<Exercise, 'name' | 'muscle_group' | 'equipment'>

export interface Exercise {
  id: number
  slug: string
  name: string
  muscle_group: MuscleGroup
  secondary_muscles: MuscleGroup[]
  equipment: Equipment | null
  is_custom: boolean
}

export interface RoutineSet {
  set_number: number
  target_reps: number | null
  target_weight_kg: number | null
  target_rpe: number | null
}

export interface RoutineExercise {
  id: number
  position: number
  exercise: Exercise
  sets: RoutineSet[]
}

export interface Routine {
  id: number
  name: string
  description: string | null
  created_at: string
  exercises: RoutineExercise[]
}

export type RoutineSetIn = Omit<RoutineSet, 'set_number'>

export interface RoutineExerciseIn {
  exercise_id: number
  sets: RoutineSetIn[]
}

export interface RoutineIn {
  name: string
  description: string | null
  exercises: RoutineExerciseIn[]
}

export interface WorkoutSet {
  id: number
  exercise_id: number
  set_number: number
  reps: number
  weight_kg: number
  rpe: number | null
  is_warmup: boolean
}

export interface Workout {
  id: number
  routine_id: number | null
  started_at: string
  ended_at: string | null
  notes: string | null
  sets: WorkoutSet[]
}

export type WorkoutSetIn = Omit<WorkoutSet, 'id'>

export interface WorkoutIn {
  client_id: string | null
  routine_id: number | null
  started_at: string
  ended_at: string | null
  notes: string | null
  sets: WorkoutSetIn[]
}

export interface LastSession {
  workout_id: number
  started_at: string
  sets: WorkoutSet[]
}

export interface BodyMeasurement {
  id: number
  measured_on: string
  weight_kg: number | null
  body_fat_pct: number | null
  waist_cm: number | null
  chest_cm: number | null
  arm_cm: number | null
  thigh_cm: number | null
  notes: string | null
}

export type BodyMeasurementIn = Omit<BodyMeasurement, 'id'>

export type ProgressionAction = 'increase_load' | 'increase_reps' | 'hold' | 'deload'

/** Why the engine chose the action; the app turns it into a sentence. */
export type ProgressionReason =
  | 'plateau'
  | 'targets_hit'
  | 'targets_hit_hard'
  | 'targets_missed'
  | 'easy_without_plan'
  | 'without_plan'
  | 'jump_too_big'

export interface PlannedSet {
  reps: number | null
  weight_kg: number | null
}

export interface Recommendation {
  exercise_id: number
  exercise_name: string
  action: ProgressionAction
  reason: ProgressionReason
  /** The load step for this exercise (it depends on the equipment). */
  increment_kg: number
  last_performed_on: string
  last_sets: { reps: number; weight_kg: number; rpe: number | null }[]
  /** The routine plan; empty when the exercise was done outside one. */
  target_sets: PlannedSet[]
  suggested_sets: PlannedSet[]
}

export interface PersonalRecord {
  exercise_id: number
  exercise_name: string
  muscle_group: MuscleGroup
  sessions: number
  best_e1rm_kg: number
  best_e1rm_on: string
  max_weight_kg: number
  max_weight_on: string
}

export interface WeeklyVolume {
  week_start: string
  muscles: { muscle_group: MuscleGroup; hard_sets: number; volume_kg: number }[]
}

export interface ProgressOverview {
  activity: {
    workouts_total: number
    workouts_last_7_days: number
    workouts_last_28_days: number
    last_workout_on: string | null
  }
  recommendations: Recommendation[]
  personal_records: PersonalRecord[]
  weekly_volume: WeeklyVolume[]
  volume_advice: VolumeAdvice[]
  body_weight: {
    entries: { measured_on: string; weight_kg: number; trend_kg: number }[]
    weekly_change_kg: number | null
  }
}

/** A main muscle trained outside the recommended weekly hard sets, on average. */
export interface VolumeAdvice {
  muscle_group: MuscleGroup
  average_hard_sets: number
  status: 'low' | 'high'
  weeks: number
  min_hard_sets: number
  max_hard_sets: number
}

export interface ExerciseSession {
  workout_id: number
  performed_on: string
  best_e1rm_kg: number
  top_weight_kg: number
  working_sets: number
  total_reps: number
  volume_kg: number
}

export interface ExerciseProgress {
  exercise_id: number
  exercise_name: string
  sessions: ExerciseSession[]
}

/** A workout read from plain text. Nothing is saved: the app prefills the workout screen with it. */
export interface DictationSet {
  reps: number | null
  weight_kg: number | null
  rpe: number | null
}

export interface DictationExercise {
  query: string
  name: string
  /** Null when the text did not settle on one exercise: the user picks it. */
  exercise_id: number | null
  sets: DictationSet[]
  /** Closest catalog entries, offered when there is no confident match. */
  suggestions: { id: number; name: string }[]
}

export interface Dictation {
  exercises: DictationExercise[]
}
