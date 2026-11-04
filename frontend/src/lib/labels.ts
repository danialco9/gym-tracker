import type {
  BadgeKind,
  Equipment,
  MissionKind,
  MuscleGroup,
  StrengthTier,
  TrainingGoal,
  Zone,
} from './types'

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

/** Strength tiers, lowest first, with the colour of their medal. */
export const STRENGTH_TIERS: Record<StrengthTier, { label: string; color: string }> = {
  bronze: { label: 'Bronce', color: '#e07b28' },
  silver: { label: 'Plata', color: '#a7b1bf' },
  gold: { label: 'Oro', color: '#facc15' },
  platinum: { label: 'Platino', color: '#2dd4bf' },
  diamond: { label: 'Diamante', color: '#3b82f6' },
  emerald: { label: 'Esmeralda', color: '#22c55e' },
  ruby: { label: 'Rubí', color: '#ef233c' },
  master: { label: 'Máster', color: '#a855f7' },
}

const TIER_ORDER = Object.keys(STRENGTH_TIERS) as StrengthTier[]

/** The body zones ranked on their own, in the order they are shown. */
export const ZONE_LABELS: Record<Zone, { label: string }> = {
  chest: { label: 'Pecho' },
  back: { label: 'Espalda' },
  shoulders: { label: 'Hombros' },
  arms: { label: 'Brazos' },
  legs: { label: 'Pierna' },
  core: { label: 'Core' },
}

/** The tier after this one, or null at Master. */
export function nextTier(tier: StrengthTier): StrengthTier | null {
  return TIER_ORDER[TIER_ORDER.indexOf(tier) + 1] ?? null
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
