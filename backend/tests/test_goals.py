import pytest

from gym_tracker.analysis import DEFAULT_VOLUME_RULES, GOAL_PLANS, volume_rules_for
from gym_tracker.enums import TrainingGoal


def test_every_goal_has_a_plan() -> None:
    assert set(GOAL_PLANS) == set(TrainingGoal)


@pytest.mark.parametrize("goal", list(TrainingGoal))
def test_goal_ranges_are_ordered(goal: TrainingGoal) -> None:
    plan = GOAL_PLANS[goal]
    for low, high in (plan.compound_reps, plan.isolation_reps, plan.rpe, plan.rest_seconds):
        assert 0 < low <= high
    assert plan.rpe[1] <= 10
    assert 0 < plan.volume.min_hard_sets < plan.volume.max_hard_sets


def test_volume_rules_follow_the_goal() -> None:
    assert volume_rules_for(None) == DEFAULT_VOLUME_RULES
    assert volume_rules_for("lose_fat").max_hard_sets == 14
    # Unlike the general range, building muscle asks for at least 12 hard sets a week.
    assert volume_rules_for(TrainingGoal.BUILD_MUSCLE).min_hard_sets == 12
