"""Strength tiers, from Bronze to Master, for the ranking.

The tier comes from the lift's percentile: the share of gym-goers of the lifter's own body weight
and sex whose best estimated one-rep max is lower, so a light and a heavy lifter compete on equal
terms. Nobody is compared with the app's other users.

The percentile is an estimate from published strength standards (see ``strength_standards``),
which cover the main lifts. Every other exercise borrows the standards of a similar lift, through
each exercise's own scale: the ratio of one-rep max to body weight a top lifter reaches, because
1.5x body weight is little on a leg press but out of reach on a curl. Dumbbell scales are per
dumbbell, as the weight is logged.
"""

from __future__ import annotations

import math
from bisect import bisect_right
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum
from statistics import NormalDist

from gym_tracker.analysis.strength_standards import (
    ADDED_WEIGHT_STANDARDS,
    FEMALE_BODY_WEIGHTS,
    FEMALE_STANDARDS,
    MALE_BODY_WEIGHTS,
    MALE_STANDARDS,
)
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

# The ratio of estimated 1RM to body weight that a top lifter reaches, per catalog exercise: what
# tells how the loads of two exercises compare.
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
    """An exercise's scale (see MASTER_RATIOS), or None when it is not ranked."""
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
    # How gym-goers lift, estimated from the published standards.
    ESTIMATE = "estimate"


# The share of gym-goers each column of a standards row is stronger than. The standards come from
# lifters who log their lifts, more trained than the usual gym-goer, so each level counts one step
# up: the lift that beats half of them (two years of training) beats 80 % of gym-goers, and the
# typical gym-goer is their novice, with six months of training.
GYM_GOER_PERCENTILES: tuple[float, ...] = (0.20, 0.50, 0.80, 0.95, 0.99)
_NORMAL = NormalDist()
_STANDARD_SCORES = tuple(_NORMAL.inv_cdf(share) for share in GYM_GOER_PERCENTILES)
# With the sex unknown, the lift is compared with men and women together, in this proportion.
MALE_SHARE = 0.5

# The lift with standards that a muscle's other exercises are measured on, by equipment; None holds
# the rest of the equipment.
_REFERENCE_LIFTS: dict[MuscleGroup, dict[Equipment | None, str]] = {
    MuscleGroup.CHEST: {
        Equipment.DUMBBELL: "dumbbell-bench-press",
        Equipment.BODYWEIGHT: "triceps-dip",
        None: "bench-press",
    },
    MuscleGroup.BACK: {Equipment.CABLE: "lat-pulldown", Equipment.BODYWEIGHT: "pull-up", None: "barbell-row"},
    MuscleGroup.LOWER_BACK: {None: "deadlift"},
    MuscleGroup.TRAPS: {None: "deadlift"},
    MuscleGroup.SHOULDERS: {
        Equipment.DUMBBELL: "dumbbell-shoulder-press",
        Equipment.KETTLEBELL: "dumbbell-shoulder-press",
        None: "overhead-press",
    },
    MuscleGroup.BICEPS: {Equipment.DUMBBELL: "dumbbell-curl", None: "barbell-curl"},
    MuscleGroup.TRICEPS: {Equipment.BODYWEIGHT: "triceps-dip", None: "triceps-pushdown"},
    MuscleGroup.FOREARMS: {Equipment.DUMBBELL: "dumbbell-curl", None: "barbell-curl"},
    MuscleGroup.ABS: {None: "lat-pulldown"},
    MuscleGroup.QUADS: {Equipment.MACHINE: "leg-press", None: "back-squat"},
    MuscleGroup.HAMSTRINGS: {Equipment.MACHINE: "leg-extension", None: "romanian-deadlift"},
    MuscleGroup.GLUTES: {None: "hip-thrust"},
    MuscleGroup.ADDUCTORS: {None: "leg-extension"},
    MuscleGroup.ABDUCTORS: {None: "leg-extension"},
    MuscleGroup.CALVES: {None: "leg-press"},
}


@dataclass(frozen=True)
class Standard:
    """The lift whose standards an exercise is measured on."""

    lift: str
    # What a load on the exercise is worth on that lift: 1 for the lift itself.
    factor: float


def standard_for(slug: str, muscle_group: MuscleGroup, equipment: Equipment | None) -> Standard | None:
    """The standards an exercise is ranked with, or None when it is not ranked.

    An exercise without standards of its own borrows those of a similar lift, with its loads scaled
    by how the two compare (see MASTER_RATIOS).
    """
    scale = master_ratio(slug, muscle_group, equipment)
    if scale is None:
        return None
    if slug in MALE_STANDARDS:
        return Standard(slug, 1.0)
    references = _REFERENCE_LIFTS[muscle_group]
    lift = references.get(equipment, references[None])
    return Standard(lift, MASTER_RATIOS[lift] / scale)


def _standards_at(lift: str, sex: Sex, body_weight_kg: float) -> list[float]:
    """The lift's standards for a body weight, between the two rows around it."""
    rows, body_weights = (
        (MALE_STANDARDS[lift], MALE_BODY_WEIGHTS) if sex is Sex.MALE else (FEMALE_STANDARDS[lift], FEMALE_BODY_WEIGHTS)
    )
    # Lighter and heavier lifters than the table covers take its first and last rows.
    weight = min(max(body_weight_kg, body_weights[0]), body_weights[-1])
    index = min(bisect_right(body_weights, weight), len(body_weights) - 1) - 1
    share = (weight - body_weights[index]) / (body_weights[index + 1] - body_weights[index])
    # Pull-ups and dips have the added weight as standard; the lift is that plus the body.
    own = body_weight_kg if lift in ADDED_WEIGHT_STANDARDS else 0.0
    return [low + (high - low) * share + own for low, high in zip(rows[index], rows[index + 1], strict=True)]


def _share_below(max_kg: float, standards: Sequence[float]) -> float:
    """The share of lifters under a max: a straight line between standards, in log kilos and normal scores."""
    logs = [math.log(standard) for standard in standards]
    # Below the first standard and above the last, the nearest stretch carries on.
    index = min(max(bisect_right(standards, max_kg), 1), len(standards) - 1) - 1
    slope = (_STANDARD_SCORES[index + 1] - _STANDARD_SCORES[index]) / (logs[index + 1] - logs[index])
    return _NORMAL.cdf(_STANDARD_SCORES[index] + (math.log(max_kg) - logs[index]) * slope)


def estimated_percentile(max_kg: float, body_weight_kg: float, standard: Standard, sex: Sex | None) -> float:
    """The estimated share of gym-goers of the same body weight (and sex, when known) who lift less.

    ``max_kg`` is the estimated one-rep max on the exercise, body included on pull-ups and dips.
    """
    equivalent = max_kg * standard.factor

    def below(of_sex: Sex) -> float:
        return _share_below(equivalent, _standards_at(standard.lift, of_sex, body_weight_kg))

    if sex is None:
        return MALE_SHARE * below(Sex.MALE) + (1 - MALE_SHARE) * below(Sex.FEMALE)
    return below(sex)


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
