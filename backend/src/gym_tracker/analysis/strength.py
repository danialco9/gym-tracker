"""Strength tiers, from Bronze to Master, for the ranking.

A lift is measured relative to body weight: the best estimated one-rep max divided by the lifter's
body weight, so a light and a heavy lifter compete on equal terms. The tier comes from the lift's
percentile, the share of people who lift less: among the app's users once enough of them do the
exercise, and until then from an estimate of how gym-goers lift it.

The estimate takes each exercise's own scale, the ratio a top lifter reaches (about the strongest
2 % of men), because 1.5x body weight is little on a leg press but out of reach on a curl. Dumbbell
scales are per dumbbell, as the weight is logged.
"""

from __future__ import annotations

import math
from bisect import bisect_left, bisect_right
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum
from statistics import NormalDist

from gym_tracker.enums import Equipment, MuscleGroup, Sex

# Beyond about 12 reps the Epley estimate overrates the max, so longer sets count as 12.
MAX_ESTIMATED_REPS = 12
EPLEY_REPS_DIVISOR = 30.0


class StrengthTier(StrEnum):
    BRONZE = "bronze"
    SILVER = "silver"
    GOLD = "gold"
    PLATINUM = "platinum"
    DIAMOND = "diamond"
    EMERALD = "emerald"
    RUBY = "ruby"
    MASTER = "master"


# The percentile each tier starts at, as a share of people lifting less, lowest first.
TIER_THRESHOLDS: tuple[tuple[StrengthTier, float], ...] = (
    (StrengthTier.BRONZE, 0.0),
    (StrengthTier.SILVER, 0.20),
    (StrengthTier.GOLD, 0.40),
    (StrengthTier.PLATINUM, 0.60),
    (StrengthTier.DIAMOND, 0.75),
    (StrengthTier.EMERALD, 0.87),
    (StrengthTier.RUBY, 0.94),
    (StrengthTier.MASTER, 0.98),
)


class Zone(StrEnum):
    """The body areas ranked on their own: each muscle group belongs to one."""

    CHEST = "chest"
    BACK = "back"
    SHOULDERS = "shoulders"
    ARMS = "arms"
    LEGS = "legs"
    CORE = "core"


ZONES: dict[MuscleGroup, Zone] = {
    MuscleGroup.CHEST: Zone.CHEST,
    MuscleGroup.BACK: Zone.BACK,
    MuscleGroup.LOWER_BACK: Zone.BACK,
    MuscleGroup.TRAPS: Zone.BACK,
    MuscleGroup.SHOULDERS: Zone.SHOULDERS,
    MuscleGroup.BICEPS: Zone.ARMS,
    MuscleGroup.TRICEPS: Zone.ARMS,
    MuscleGroup.FOREARMS: Zone.ARMS,
    MuscleGroup.ABS: Zone.CORE,
    MuscleGroup.QUADS: Zone.LEGS,
    MuscleGroup.HAMSTRINGS: Zone.LEGS,
    MuscleGroup.GLUTES: Zone.LEGS,
    MuscleGroup.ADDUCTORS: Zone.LEGS,
    MuscleGroup.ABDUCTORS: Zone.LEGS,
    MuscleGroup.CALVES: Zone.LEGS,
}

# The ratio of estimated 1RM to body weight that the strongest 2 % of men reach, per catalog exercise.
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
    """An exercise's scale for the estimate (see MASTER_RATIOS), or None when it is not ranked."""
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


class PercentileSource(StrEnum):
    # How gym-goers are estimated to lift, while too few app users do the exercise.
    ESTIMATE = "estimate"
    # The app's own users: at least MIN_APP_LIFTERS of them.
    APP = "app"


# From this many other lifters on an exercise (of the same sex, when known), the app's users are
# compared with each other instead of with the estimate.
MIN_APP_LIFTERS = 30

# The estimate: lifts relative to body weight spread log-normally, this wide in log terms. With the
# scale at the 98th percentile of men, the typical man lifts about 0.44 of it.
LOG_SPREAD = 0.40
_SCALE_PERCENTILE = 0.98
_NORMAL = NormalDist()
# The typical woman's lift as a share of the typical man's, per zone: closer on the legs.
FEMALE_MEDIAN_FACTORS: dict[Zone, float] = {
    Zone.CHEST: 0.55,
    Zone.BACK: 0.60,
    Zone.SHOULDERS: 0.55,
    Zone.ARMS: 0.55,
    Zone.LEGS: 0.70,
    Zone.CORE: 0.65,
}
# With the sex unknown, the lift is compared with men and women together, in this proportion.
MALE_SHARE = 0.5


def estimated_percentile(ratio: float, scale: float, zone: Zone, sex: Sex | None) -> float:
    """The estimated share of gym-goers (of the same sex, when known) who lift less, from 0 to 1."""
    male_median = scale * math.exp(-_NORMAL.inv_cdf(_SCALE_PERCENTILE) * LOG_SPREAD)

    def below(median: float) -> float:
        return _NORMAL.cdf(math.log(ratio / median) / LOG_SPREAD)

    male = below(male_median)
    female = below(male_median * FEMALE_MEDIAN_FACTORS[zone])
    if sex is Sex.MALE:
        return male
    if sex is Sex.FEMALE:
        return female
    return MALE_SHARE * male + (1 - MALE_SHARE) * female


def app_percentile(ratio: float, others: Sequence[float]) -> float:
    """The share of the other lifters (``others``, sorted) who lift less; a tie counts half."""
    below = bisect_left(others, ratio)
    tied = bisect_right(others, ratio) - below
    return (below + tied / 2) / len(others)


def zone_score(percentiles: list[float]) -> float:
    """A zone's percentile: the mean over every exercise of it the lifter has done."""
    return sum(percentiles) / len(percentiles)


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
