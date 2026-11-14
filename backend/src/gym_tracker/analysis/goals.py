"""What each training goal asks for: rep ranges, effort, rest and weekly sets per muscle."""

from __future__ import annotations

from dataclasses import dataclass

from gym_tracker.analysis.recommendations import DEFAULT_VOLUME_RULES, RepRanges, VolumeRules
from gym_tracker.enums import TrainingGoal


@dataclass(frozen=True)
class GoalPlan:
    # Multi-joint lifts (squat, bench...) and single-joint ones (curls, raises...), inclusive.
    compound_reps: tuple[int, int]
    isolation_reps: tuple[int, int]
    rpe: tuple[float, float]
    rest_seconds: tuple[int, int]
    volume: VolumeRules


# Every goal works the same rep ranges, by double progression up to 12 reps at most: a new weight
# brings the reps down to 6-8 on the big lifts and to 8 on single-joint ones, and they climb back
# to 12 before the weight goes up again. Past 12 reps a set still builds muscle when taken close
# to failure, but it mostly adds fatigue and does less for strength. The goals differ in effort,
# rest and weekly volume.
COMPOUND_REPS = (6, 12)
ISOLATION_REPS = (8, 12)

GOAL_PLANS: dict[TrainingGoal, GoalPlan] = {
    # A deficit recovers worse, so the volume ceiling is lower and sets stop further from failure.
    TrainingGoal.LOSE_FAT: GoalPlan(
        compound_reps=COMPOUND_REPS,
        isolation_reps=ISOLATION_REPS,
        rpe=(7.0, 8.0),
        rest_seconds=(60, 90),
        volume=VolumeRules(min_hard_sets=10, max_hard_sets=14),
    ),
    TrainingGoal.BUILD_MUSCLE: GoalPlan(
        compound_reps=COMPOUND_REPS,
        isolation_reps=ISOLATION_REPS,
        rpe=(8.0, 9.0),
        rest_seconds=(120, 180),
        volume=VolumeRules(min_hard_sets=12, max_hard_sets=20),
    ),
    # Long rests, so every set is strong; fewer sets fit in a week.
    TrainingGoal.BUILD_STRENGTH: GoalPlan(
        compound_reps=COMPOUND_REPS,
        isolation_reps=ISOLATION_REPS,
        rpe=(8.0, 9.0),
        rest_seconds=(180, 300),
        volume=VolumeRules(min_hard_sets=10, max_hard_sets=16),
    ),
    # A moderate effort and volume.
    TrainingGoal.RECOMPOSITION: GoalPlan(
        compound_reps=COMPOUND_REPS,
        isolation_reps=ISOLATION_REPS,
        rpe=(7.5, 8.5),
        rest_seconds=(90, 150),
        volume=VolumeRules(min_hard_sets=10, max_hard_sets=16),
    ),
}


def volume_rules_for(goal: str | None) -> VolumeRules:
    """The weekly sets range for a goal, or the general one while the user has not picked any."""
    return DEFAULT_VOLUME_RULES if goal is None else GOAL_PLANS[TrainingGoal(goal)].volume


def rep_ranges_for(goal: str | None) -> RepRanges | None:
    """The reps a goal asks for per kind of exercise; none while the user has not picked a goal."""
    if goal is None:
        return None
    plan = GOAL_PLANS[TrainingGoal(goal)]
    return RepRanges(compound=plan.compound_reps, isolation=plan.isolation_reps)
