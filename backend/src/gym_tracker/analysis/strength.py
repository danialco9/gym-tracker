"""Strength tiers, from Bronze to Master, for the ranking.

A lift is scored relative to body weight: the best estimated one-rep max divided by the lifter's
body weight, so a light and a heavy lifter compete on equal terms. Each exercise has its own scale,
the ratio that earns Master in it, because 1.5x body weight is little on a leg press but out of
reach on a curl. Dumbbell scales are per dumbbell, as the weight is logged.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from gym_tracker.enums import Equipment, MuscleGroup

# Beyond about 12 reps the Epley estimate overrates the max, so longer sets count as 12.
MAX_ESTIMATED_REPS = 12
EPLEY_REPS_DIVISOR = 30.0
# The overall tier is the mean score of this many best exercises; missing ones count as zero, so a
# single great lift is not enough.
OVERALL_EXERCISES = 5


class StrengthTier(StrEnum):
    BRONZE = "bronze"
    SILVER = "silver"
    GOLD = "gold"
    PLATINUM = "platinum"
    DIAMOND = "diamond"
    EMERALD = "emerald"
    RUBY = "ruby"
    MASTER = "master"


# The share of the Master ratio each tier starts at, lowest first.
TIER_THRESHOLDS: tuple[tuple[StrengthTier, float], ...] = (
    (StrengthTier.BRONZE, 0.0),
    (StrengthTier.SILVER, 0.25),
    (StrengthTier.GOLD, 0.40),
    (StrengthTier.PLATINUM, 0.52),
    (StrengthTier.DIAMOND, 0.64),
    (StrengthTier.EMERALD, 0.76),
    (StrengthTier.RUBY, 0.88),
    (StrengthTier.MASTER, 1.0),
)

# The ratio of estimated 1RM to body weight that earns Master, per catalog exercise.
MASTER_RATIOS: dict[str, float] = {
    # Chest
    "bench-press": 2.0,
    "incline-bench-press": 1.7,
    "decline-bench-press": 2.1,
    "dumbbell-bench-press": 0.8,
    "incline-dumbbell-press": 0.7,
    "decline-dumbbell-press": 0.8,
    "dumbbell-floor-press": 0.7,
    "dumbbell-fly": 0.4,
    "incline-dumbbell-fly": 0.35,
    "decline-dumbbell-fly": 0.4,
    "dumbbell-pullover": 0.6,
    "machine-chest-press": 2.0,
    "incline-machine-press": 1.7,
    "decline-machine-press": 2.0,
    "pec-deck": 1.5,
    "cable-crossover": 0.5,
    "flat-cable-fly": 0.5,
    "incline-cable-fly": 0.45,
    "cable-chest-press": 1.2,
    "smith-bench-press": 2.1,
    "smith-incline-press": 1.8,
    "smith-decline-press": 2.2,
    "chest-dip": 2.2,
    # Back
    "barbell-row": 1.8,
    "pendlay-row": 1.6,
    "reverse-grip-barbell-row": 1.8,
    "meadows-row": 1.0,
    "barbell-pullover": 0.8,
    "dumbbell-row": 1.0,
    "chest-supported-dumbbell-row": 0.8,
    "lat-pulldown": 1.5,
    "close-grip-lat-pulldown": 1.5,
    "wide-grip-lat-pulldown": 1.4,
    "neutral-grip-lat-pulldown": 1.5,
    "reverse-grip-lat-pulldown": 1.5,
    "single-arm-lat-pulldown": 0.75,
    "seated-cable-row": 1.6,
    "single-arm-cable-row": 0.8,
    "straight-arm-pulldown": 0.8,
    "rope-straight-arm-pulldown": 0.8,
    "machine-row": 1.8,
    "t-bar-row": 2.25,
    "chest-supported-t-bar-row": 1.75,
    "high-row-machine": 1.8,
    "iso-row-machine": 1.8,
    "smith-row": 1.8,
    "pull-up": 2.0,
    "chin-up": 2.1,
    "neutral-grip-pull-up": 2.05,
    # Lower back
    "deadlift": 3.25,
    "sumo-deadlift": 3.25,
    "trap-bar-deadlift": 3.5,
    "rack-pull": 3.75,
    # Traps
    "barbell-shrug": 2.75,
    "dumbbell-shrug": 1.1,
    "cable-shrug": 2.0,
    "machine-shrug": 3.0,
    "smith-shrug": 2.75,
    # Shoulders
    "overhead-press": 1.35,
    "push-press": 1.7,
    "upright-row": 1.1,
    "plate-front-raise": 0.4,
    "barbell-rear-delt-row": 1.0,
    "dumbbell-shoulder-press": 0.55,
    "arnold-press": 0.5,
    "lateral-raise": 0.3,
    "front-raise": 0.3,
    "rear-delt-fly": 0.25,
    "dumbbell-upright-row": 0.4,
    "kettlebell-press": 0.55,
    "cable-lateral-raise": 0.2,
    "face-pull": 0.75,
    "cable-rear-delt-fly": 0.25,
    "cable-front-raise": 0.35,
    "cable-upright-row": 0.9,
    "cable-external-rotation": 0.15,
    "machine-shoulder-press": 1.5,
    "machine-lateral-raise": 0.8,
    "reverse-pec-deck": 1.0,
    "smith-shoulder-press": 1.4,
    # Biceps
    "barbell-curl": 1.0,
    "drag-curl": 0.8,
    "ez-bar-curl": 1.0,
    "preacher-curl": 0.85,
    "spider-curl": 0.7,
    "dumbbell-curl": 0.45,
    "hammer-curl": 0.5,
    "incline-dumbbell-curl": 0.35,
    "concentration-curl": 0.35,
    "cross-body-hammer-curl": 0.45,
    "incline-hammer-curl": 0.35,
    "dumbbell-preacher-curl": 0.35,
    "zottman-curl": 0.35,
    "cable-curl": 0.9,
    "bayesian-cable-curl": 0.4,
    "high-cable-curl": 0.4,
    "rope-hammer-curl": 0.9,
    "cable-preacher-curl": 0.75,
    "machine-curl": 0.9,
    # Triceps
    "close-grip-bench-press": 1.65,
    "jm-press": 1.3,
    "skull-crusher": 0.9,
    "triceps-pushdown": 1.0,
    "rope-pushdown": 0.85,
    "overhead-cable-extension": 0.85,
    "single-arm-pushdown": 0.45,
    "reverse-grip-pushdown": 0.75,
    "v-bar-pushdown": 1.0,
    "cable-kickback": 0.25,
    "dumbbell-kickback": 0.25,
    "overhead-dumbbell-extension": 0.6,
    "dumbbell-skull-crusher": 0.4,
    "machine-triceps-extension": 1.2,
    "machine-dip": 2.2,
    "smith-close-grip-bench-press": 1.75,
    "triceps-dip": 2.2,
    # Forearms
    "barbell-wrist-curl": 0.8,
    "reverse-wrist-curl": 0.5,
    "reverse-barbell-curl": 0.75,
    "wrist-curl": 0.4,
    "cable-wrist-curl": 0.7,
    # Abs
    "cable-crunch": 1.25,
    "cable-woodchopper": 0.6,
    "pallof-press": 0.4,
    "dumbbell-side-bend": 0.6,
    "machine-crunch": 1.5,
    # Quads
    "back-squat": 2.75,
    "front-squat": 2.25,
    "box-squat": 2.6,
    "barbell-hack-squat": 2.25,
    "barbell-lunge": 1.75,
    "bulgarian-split-squat": 0.75,
    "walking-lunge": 0.7,
    "goblet-squat": 0.8,
    "dumbbell-squat": 0.8,
    "sumo-squat": 0.9,
    "reverse-lunge": 0.7,
    "static-lunge": 0.7,
    "step-up": 0.6,
    "kettlebell-goblet-squat": 0.8,
    "hack-squat": 4.0,
    "leg-press": 6.0,
    "leg-extension": 1.75,
    "pendulum-squat": 3.5,
    "belt-squat": 3.5,
    "single-leg-press": 3.0,
    "single-leg-extension": 0.9,
    "smith-squat": 2.75,
    "smith-leg-press": 5.0,
    "smith-split-squat": 1.5,
    # Hamstrings
    "romanian-deadlift": 2.5,
    "stiff-leg-deadlift": 2.25,
    "good-morning": 1.75,
    "dumbbell-romanian-deadlift": 1.0,
    "single-leg-romanian-deadlift": 0.6,
    "lying-leg-curl": 1.25,
    "seated-leg-curl": 1.25,
    "standing-leg-curl": 0.6,
    "smith-romanian-deadlift": 2.5,
    # Glutes
    "hip-thrust": 3.5,
    "barbell-glute-bridge": 3.5,
    "hip-thrust-machine": 4.0,
    "smith-hip-thrust": 3.5,
    "glute-kickback-machine": 1.25,
    "cable-glute-kickback": 0.5,
    "cable-pull-through": 1.25,
    "kettlebell-swing": 0.6,
    # Adductors and abductors
    "hip-adduction-machine": 2.0,
    "hip-abduction-machine": 2.0,
    "cable-hip-adduction": 0.5,
    "cable-hip-abduction": 0.5,
    # Calves
    "standing-calf-raise": 3.0,
    "seated-calf-raise": 2.0,
    "leg-press-calf-raise": 4.5,
    "donkey-calf-raise": 3.0,
    "smith-calf-raise": 3.0,
    "single-leg-calf-raise": 0.6,
}
# Exercises lifted with the body plus any added weight: the logged weight is the extra load.
BODYWEIGHT_LIFTS = frozenset({"pull-up", "chin-up", "neutral-grip-pull-up", "chest-dip", "triceps-dip"})

# Catalog exercises with a load that says nothing about strength: assisted ones, where more weight
# means less effort, and band or rollout work. Bodyweight exercises other than BODYWEIGHT_LIFTS
# are left out too, as they have no scale and no equipment factor.
UNRANKED = frozenset(
    {
        "assisted-pull-up-machine",
        "band-assisted-pull-up",
        "band-lateral-walk",
        "band-pull-apart",
        "barbell-rollout",
        "glute-ham-raise",
    }
)

# Scales for exercises added to the catalog later: a barbell scale per muscle, scaled by equipment.
_MUSCLE_MASTER_RATIOS: dict[MuscleGroup, float] = {
    MuscleGroup.CHEST: 2.0,
    MuscleGroup.BACK: 1.8,
    MuscleGroup.LOWER_BACK: 3.25,
    MuscleGroup.TRAPS: 2.75,
    MuscleGroup.SHOULDERS: 1.35,
    MuscleGroup.BICEPS: 1.0,
    MuscleGroup.TRICEPS: 1.6,
    MuscleGroup.FOREARMS: 0.8,
    MuscleGroup.ABS: 1.25,
    MuscleGroup.QUADS: 2.75,
    MuscleGroup.HAMSTRINGS: 2.25,
    MuscleGroup.GLUTES: 3.5,
    MuscleGroup.ADDUCTORS: 2.0,
    MuscleGroup.ABDUCTORS: 2.0,
    MuscleGroup.CALVES: 3.0,
}
_EQUIPMENT_FACTORS: dict[Equipment, float] = {
    Equipment.BARBELL: 1.0,
    Equipment.EZ_BAR: 0.9,
    Equipment.SMITH_MACHINE: 1.05,
    Equipment.MACHINE: 1.25,
    Equipment.CABLE: 0.75,
    Equipment.DUMBBELL: 0.45,
    Equipment.KETTLEBELL: 0.45,
}


def master_ratio(slug: str, muscle_group: MuscleGroup, equipment: Equipment | None) -> float | None:
    """The ratio that earns Master in an exercise, or None when it is not ranked."""
    if slug in MASTER_RATIOS:
        return MASTER_RATIOS[slug]
    if slug in UNRANKED or equipment not in _EQUIPMENT_FACTORS:
        return None
    return _MUSCLE_MASTER_RATIOS[muscle_group] * _EQUIPMENT_FACTORS[equipment]


def estimated_max(weight_kg: float, reps: int) -> float:
    """Epley one-rep max, with sets beyond ``MAX_ESTIMATED_REPS`` counted as that many reps."""
    if reps <= 1:
        return weight_kg
    return weight_kg * (1 + min(reps, MAX_ESTIMATED_REPS) / EPLEY_REPS_DIVISOR)


def lift_score(best_max_kg: float, body_weight_kg: float, ratio: float) -> float:
    """How far a lift goes towards Master: 1.0 is Master, capped there."""
    return min(best_max_kg / body_weight_kg / ratio, 1.0)


def overall_score(scores: list[float]) -> float:
    """The mean of the best ``OVERALL_EXERCISES`` scores, counting missing ones as zero."""
    best = sorted(scores, reverse=True)[:OVERALL_EXERCISES]
    return sum(best) / OVERALL_EXERCISES


@dataclass(frozen=True)
class TierProgress:
    tier: StrengthTier
    # Progress from this tier towards the next, from 0 to 1; 1 at Master.
    progress: float


def tier_for(score: float) -> TierProgress:
    """The tier a score reaches, and how far it is towards the next one."""
    index = max(i for i, (_, start) in enumerate(TIER_THRESHOLDS) if score >= start)
    tier, start = TIER_THRESHOLDS[index]
    if index == len(TIER_THRESHOLDS) - 1:
        return TierProgress(tier, 1.0)
    end = TIER_THRESHOLDS[index + 1][1]
    return TierProgress(tier, (score - start) / (end - start))
