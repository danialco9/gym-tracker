"""What each training goal asks for: rep ranges, effort, rest and weekly sets per muscle."""

from __future__ import annotations

from dataclasses import dataclass

from gym_tracker.analysis.recommendations import DEFAULT_VOLUME_RULES, VolumeRules
from gym_tracker.enums import TrainingGoal


@dataclass(frozen=True)
class GoalPlan:
    # Multi-joint lifts (squat, bench...) and single-joint ones (curls, raises...), inclusive.
    compound_reps: tuple[int, int]
    isolation_reps: tuple[int, int]
    rpe: tuple[float, float]
    rest_seconds: tuple[int, int]
    volume: VolumeRules


GOAL_PLANS: dict[TrainingGoal, GoalPlan] = {
    # Heavy loads keep the muscle while eating less; a deficit recovers worse, so the volume
    # ceiling is lower and sets stop further from failure.
    TrainingGoal.LOSE_FAT: GoalPlan(
        compound_reps=(6, 10),
        isolation_reps=(10, 15),
        rpe=(7.0, 8.0),
        rest_seconds=(60, 90),
        volume=VolumeRules(min_hard_sets=10, max_hard_sets=14),
    ),
    TrainingGoal.BUILD_MUSCLE: GoalPlan(
        compound_reps=(6, 10),
        isolation_reps=(8, 12),
        rpe=(8.0, 9.0),
        rest_seconds=(120, 180),
        volume=VolumeRules(min_hard_sets=12, max_hard_sets=20),
    ),
    # Strength work on the big lifts plus lighter accessories, at a moderate volume.
    TrainingGoal.RECOMPOSITION: GoalPlan(
        compound_reps=(4, 8),
        isolation_reps=(10, 15),
        rpe=(7.5, 8.5),
        rest_seconds=(90, 150),
        volume=VolumeRules(min_hard_sets=10, max_hard_sets=16),
    ),
}


def volume_rules_for(goal: str | None) -> VolumeRules:
    """The weekly sets range for a goal, or the general one while the user has not picked any."""
    return DEFAULT_VOLUME_RULES if goal is None else GOAL_PLANS[TrainingGoal(goal)].volume
