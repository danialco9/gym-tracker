import type { BadgeKind, Equipment, MissionKind, MuscleGroup, TrainingGoal } from './types'

export const TRAINING_GOAL_LABELS: Record<TrainingGoal, { title: string; hint: string }> = {
  lose_fat: { title: 'Bajar grasa', hint: 'Perder peso sin perder músculo' },
  build_muscle: { title: 'Ganar músculo', hint: 'Subir peso y volumen' },
  recomposition: { title: 'Recomposición', hint: 'Menos grasa y más músculo a la vez' },
}

/** What each weekly mission asks, given its target. */
export const MISSION_LABELS: Record<MissionKind, (target: number) => string> = {
  training_days: (target) => `Entrena ${target} días`,
  hard_sets: (target) => `Completa ${target} series`,
  records: (target) => (target === 1 ? 'Bate un récord' : `Bate ${target} récords`),
}

export const BADGE_LABELS: Record<BadgeKind, string> = {
  first_workout: 'Primer entreno',
  workouts_10: '10 entrenos',
  workouts_50: '50 entrenos',
  workouts_100: '100 entrenos',
  first_record: 'Primer récord',
  records_10: '10 récords',
  streak_7: 'Racha de 7 días',
  streak_30: 'Racha de 30 días',
}

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Pecho',
  back: 'Espalda',
  lower_back: 'Lumbar',
  traps: 'Trapecio',
  shoulders: 'Hombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  forearms: 'Antebrazos',
  abs: 'Abdominales',
  quads: 'Cuádriceps',
  hamstrings: 'Isquiotibiales',
  glutes: 'Glúteos',
  adductors: 'Aductores',
  abductors: 'Abductores',
  calves: 'Gemelos',
}

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barra',
  ez_bar: 'Barra Z',
  dumbbell: 'Mancuernas',
  kettlebell: 'Kettlebell',
  machine: 'Máquina',
  smith_machine: 'Multipower',
  cable: 'Polea',
  bodyweight: 'Peso corporal',
  band: 'Banda elástica',
}
