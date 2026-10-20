import type { Equipment, MuscleGroup, TrainingGoal } from './types'

export const TRAINING_GOAL_LABELS: Record<TrainingGoal, { title: string; hint: string }> = {
  lose_fat: { title: 'Bajar grasa', hint: 'Perder peso sin perder músculo' },
  build_muscle: { title: 'Ganar músculo', hint: 'Subir peso y volumen' },
  recomposition: { title: 'Recomposición', hint: 'Menos grasa y más músculo a la vez' },
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
