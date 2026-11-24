"""Strength milestones: round weights reached and kilos gained since the first session.

No points and no levels, only moments worth telling: "first 100 kg on the bench press" or "+20 kg
on the squat since you started". Like the streak they are derived from the log, never stored, so
editing a workout can never leave one behind.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from gym_tracker.analysis.loader import TrainingLog
from gym_tracker.analysis.metrics import session_bests, working_sets
from gym_tracker.enums import Equipment


class MilestoneKind(StrEnum):
    # The first time the top weight reaches a round number.
    WEIGHT = "weight"
    # The top weight is this many kilos above the first session's.
    GAIN = "gain"


@dataclass(frozen=True)
class Steps:
    first_round_kg: float
    round_step_kg: float
    gain_step_kg: float


# A dumbbell is logged by its own weight: 10 kg more on each hand is a long way, so its steps are
# smaller. Bodyweight and band sets log only the added load, which says little on its own.
BAR_STEPS = Steps(first_round_kg=40, round_step_kg=20, gain_step_kg=10)
DUMBBELL_STEPS = Steps(first_round_kg=10, round_step_kg=10, gain_step_kg=5)
STEPS_BY_EQUIPMENT: dict[str, Steps | None] = {
    Equipment.DUMBBELL: DUMBBELL_STEPS,
    Equipment.KETTLEBELL: DUMBBELL_STEPS,
    Equipment.BODYWEIGHT: None,
    Equipment.BAND: None,
}


@dataclass(frozen=True)
class Milestone:
    exercise_id: str
    kind: MilestoneKind
    value_kg: float
    achieved_on: date
    workout_id: str


def _round_reached(top_kg: float, steps: Steps) -> float | None:
    """The highest round weight at or below ``top_kg``, if it reaches the first one."""
    if top_kg < steps.first_round_kg:
        return None
    return (
        steps.first_round_kg + math.floor((top_kg - steps.first_round_kg) / steps.round_step_kg) * steps.round_step_kg
    )


def _gain_reached(top_kg: float, first_kg: float, steps: Steps) -> float:
    return math.floor((top_kg - first_kg) / steps.gain_step_kg) * steps.gain_step_kg


def exercise_milestones(exercise_id: str, sessions: list[tuple[str, date, float]], steps: Steps) -> list[Milestone]:
    """Milestones of one exercise from its sessions, oldest first, as (workout, day, top weight).

    The first session sets the starting point and earns nothing. A session that jumps past several
    round weights at once earns only the highest: one moment, one milestone.
    """
    if not sessions:
        return []
    _, _, first_kg = sessions[0]
    best_kg = first_kg
    milestones: list[Milestone] = []
    for workout_id, day, top_kg in sessions[1:]:
        if top_kg <= best_kg:
            continue
        reached = _round_reached(top_kg, steps)
        before = _round_reached(best_kg, steps)
        if reached is not None and (before is None or reached > before):
            milestones.append(Milestone(exercise_id, MilestoneKind.WEIGHT, reached, day, workout_id))
        gain = _gain_reached(top_kg, first_kg, steps)
        if gain > 0 and gain > _gain_reached(best_kg, first_kg, steps):
            milestones.append(Milestone(exercise_id, MilestoneKind.GAIN, gain, day, workout_id))
        best_kg = top_kg
    return milestones


def log_milestones(log: TrainingLog) -> list[Milestone]:
    """Every milestone in the log, newest first; on the same day, an exercise's round weight before
    its gain."""
    bests = session_bests(working_sets(log))
    equipment = dict(zip(log.exercises["exercise_id"], log.exercises["equipment"], strict=True))
    milestones: list[Milestone] = []
    for exercise_id, rows in bests.groupby("exercise_id", sort=False):
        steps = STEPS_BY_EQUIPMENT.get(equipment.get(str(exercise_id), ""), BAR_STEPS)
        if steps is None:
            continue
        ordered = rows.sort_values("date", kind="stable")
        sessions = list(
            zip(
                ordered["workout_id"].astype(str),
                ordered["date"].dt.date,
                ordered["top_weight_kg"].astype(float),
                strict=True,
            )
        )
        milestones.extend(exercise_milestones(str(exercise_id), sessions, steps))
    # Stable: within a day the order they were found in stays.
    return sorted(milestones, key=lambda item: item.achieved_on, reverse=True)
