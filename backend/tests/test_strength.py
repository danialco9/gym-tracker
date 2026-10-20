import pytest

from gym_tracker.analysis.strength import (
    BODYWEIGHT_LIFTS,
    MASTER_RATIOS,
    UNRANKED,
    StrengthTier,
    estimated_max,
    lift_score,
    master_ratio,
    overall_score,
    tier_for,
)
from gym_tracker.catalog import CATALOG
from gym_tracker.enums import Equipment, MuscleGroup


def test_every_loaded_catalog_exercise_has_its_own_scale() -> None:
    slugs = {exercise.slug for exercise in CATALOG}
    loaded = {exercise.slug for exercise in CATALOG if exercise.equipment not in {Equipment.BODYWEIGHT, Equipment.BAND}}

    assert loaded - UNRANKED <= MASTER_RATIOS.keys()
    assert MASTER_RATIOS.keys() | UNRANKED <= slugs
    assert MASTER_RATIOS.keys() >= BODYWEIGHT_LIFTS


def test_unranked_and_plain_bodyweight_exercises_have_no_scale() -> None:
    assert master_ratio("assisted-pull-up-machine", MuscleGroup.BACK, Equipment.MACHINE) is None
    assert master_ratio("crunch", MuscleGroup.ABS, Equipment.BODYWEIGHT) is None
    assert master_ratio("pull-up", MuscleGroup.BACK, Equipment.BODYWEIGHT) == 2.0


def test_exercises_without_a_scale_get_one_from_muscle_and_equipment() -> None:
    assert master_ratio("new-cable-press", MuscleGroup.CHEST, Equipment.CABLE) == pytest.approx(1.5)
    assert master_ratio("new-thing", MuscleGroup.CHEST, None) is None


def test_estimated_max_counts_long_sets_as_twelve_reps() -> None:
    assert estimated_max(100, 1) == 100
    assert estimated_max(100, 5) == pytest.approx(100 * (1 + 5 / 30))
    assert estimated_max(50, 40) == estimated_max(50, 12)


def test_lift_score_is_relative_to_body_weight_and_capped_at_master() -> None:
    assert lift_score(160, body_weight_kg=80, ratio=2.0) == 1.0
    assert lift_score(80, body_weight_kg=80, ratio=2.0) == 0.5
    assert lift_score(300, body_weight_kg=80, ratio=2.0) == 1.0


def test_overall_score_needs_five_exercises() -> None:
    assert overall_score([1.0]) == pytest.approx(0.2)
    assert overall_score([0.1, 1.0, 0.5, 0.5, 0.5, 0.5]) == pytest.approx(0.6)


@pytest.mark.parametrize(
    ("score", "tier", "progress"),
    [
        (0.0, StrengthTier.BRONZE, 0.0),
        (0.125, StrengthTier.BRONZE, 0.5),
        (0.25, StrengthTier.SILVER, 0.0),
        (0.46, StrengthTier.GOLD, 0.5),
        (0.94, StrengthTier.RUBY, 0.5),
        (1.0, StrengthTier.MASTER, 1.0),
    ],
)
def test_tier_for_a_score(score: float, tier: StrengthTier, progress: float) -> None:
    result = tier_for(score)

    assert result.tier == tier
    assert result.progress == pytest.approx(progress)
