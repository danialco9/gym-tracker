"""Ready-made routines and how they split over the days someone trains.

With three or more days each split trains every main muscle about twice a week. From four days on,
two sessions in a row never work the same muscles, so back-to-back days are fine; the full-body
sessions of fewer days work everything, so they want a rest day between them.
Multi-joint lifts plan 8 reps and single-joint ones 10, inside the 6-12 and 8-12 the progression
moves in. The routines are copied to the user's own, to edit like any other.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

MAX_TRAINING_DAYS = 6
SETS = 3


@dataclass(frozen=True)
class PresetExercise:
    slug: str
    reps: int


@dataclass(frozen=True)
class PresetRoutine:
    name: str
    description: str
    exercises: tuple[PresetExercise, ...]


def _lifts(*items: tuple[str, int]) -> tuple[PresetExercise, ...]:
    return tuple(PresetExercise(slug, reps) for slug, reps in items)


FULL_BODY_A = PresetRoutine(
    "Cuerpo completo A",
    "Rutina predeterminada: todo el cuerpo, con sentadilla y press banca.",
    _lifts(
        ("back-squat", 8),
        ("bench-press", 8),
        ("barbell-row", 8),
        ("lateral-raise", 10),
        ("dumbbell-curl", 10),
    ),
)
FULL_BODY_B = PresetRoutine(
    "Cuerpo completo B",
    "Rutina predeterminada: todo el cuerpo, con peso muerto rumano y press militar.",
    _lifts(
        ("romanian-deadlift", 8),
        ("overhead-press", 8),
        ("lat-pulldown", 8),
        ("leg-extension", 10),
        ("triceps-pushdown", 10),
    ),
)
FULL_BODY_C = PresetRoutine(
    "Cuerpo completo C",
    "Rutina predeterminada: todo el cuerpo, con prensa y press inclinado.",
    _lifts(
        ("leg-press", 8),
        ("incline-dumbbell-press", 8),
        ("seated-cable-row", 8),
        ("lying-leg-curl", 10),
        ("face-pull", 10),
    ),
)
UPPER = PresetRoutine(
    "Torso",
    "Rutina predeterminada: pecho, espalda, hombros y brazos.",
    _lifts(
        ("bench-press", 8),
        ("barbell-row", 8),
        ("overhead-press", 8),
        ("lat-pulldown", 8),
        ("lateral-raise", 10),
        ("dumbbell-curl", 10),
        ("triceps-pushdown", 10),
    ),
)
LOWER = PresetRoutine(
    "Pierna",
    "Rutina predeterminada: cuádriceps, femoral, glúteo y gemelo.",
    _lifts(
        ("back-squat", 8),
        ("romanian-deadlift", 8),
        ("leg-press", 8),
        ("leg-extension", 10),
        ("lying-leg-curl", 10),
        ("standing-calf-raise", 10),
    ),
)
PUSH = PresetRoutine(
    "Empuje",
    "Rutina predeterminada: pecho, hombros y tríceps.",
    _lifts(
        ("bench-press", 8),
        ("overhead-press", 8),
        ("incline-dumbbell-press", 8),
        ("lateral-raise", 10),
        ("triceps-pushdown", 10),
    ),
)
PULL = PresetRoutine(
    "Tirón",
    "Rutina predeterminada: espalda, deltoides posterior y bíceps.",
    _lifts(
        ("lat-pulldown", 8),
        ("barbell-row", 8),
        ("seated-cable-row", 8),
        ("face-pull", 10),
        ("barbell-curl", 10),
        ("hammer-curl", 10),
    ),
)

# The sessions of the week, in order, for each number of training days.
SPLITS: dict[int, tuple[PresetRoutine, ...]] = {
    1: (FULL_BODY_A,),
    2: (FULL_BODY_A, FULL_BODY_B),
    3: (FULL_BODY_A, FULL_BODY_B, FULL_BODY_C),
    4: (UPPER, LOWER, UPPER, LOWER),
    5: (UPPER, LOWER, PUSH, PULL, LOWER),
    6: (PUSH, PULL, LOWER, PUSH, PULL, LOWER),
}

PRESET_ROUTINES: tuple[PresetRoutine, ...] = tuple(
    dict.fromkeys(routine for split in SPLITS.values() for routine in split)
)


def preset_week(weekdays: Sequence[int]) -> list[tuple[int, PresetRoutine]]:
    """The split for that many days, laid on them in calendar order (Monday is 0)."""
    days = sorted(set(weekdays))
    if not 1 <= len(days) <= MAX_TRAINING_DAYS:
        raise ValueError(f"Between 1 and {MAX_TRAINING_DAYS} training days are needed")
    return list(zip(days, SPLITS[len(days)], strict=True))
