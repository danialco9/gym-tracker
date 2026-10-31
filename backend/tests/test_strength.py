import pytest

from gym_tracker.analysis.strength import (
    BODYWEIGHT_LIFTS,
    MASTER_RATIOS,
    UNRANKED,
    ZONES,
    StrengthTier,
    Zone,
    app_percentile,
    estimated_max,
    estimated_percentile,
    master_ratio,
    tier_for,
    zone_score,
)
from gym_tracker.catalog import CATALOG
from gym_tracker.enums import Equipment, MuscleGroup, Sex


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


def test_every_muscle_group_belongs_to_a_zone() -> None:
    assert ZONES.keys() == set(MuscleGroup)
    assert set(ZONES.values()) == set(Zone)


def test_an_exercise_scale_is_the_98th_percentile_of_men() -> None:
    assert estimated_percentile(2.0, 2.0, Zone.CHEST, Sex.MALE) == pytest.approx(0.98)
    assert estimated_percentile(0.5, 2.0, Zone.CHEST, Sex.MALE) < 0.1
    assert estimated_percentile(4.0, 2.0, Zone.CHEST, Sex.MALE) > 0.999


def test_the_same_lift_ranks_higher_among_women_and_in_between_with_the_sex_unknown() -> None:
    men = estimated_percentile(1.0, 2.0, Zone.CHEST, Sex.MALE)
    women = estimated_percentile(1.0, 2.0, Zone.CHEST, Sex.FEMALE)
    everyone = estimated_percentile(1.0, 2.0, Zone.CHEST, None)

    assert men < everyone < women
    assert everyone == pytest.approx((men + women) / 2)


def test_women_are_closer_to_men_on_the_legs() -> None:
    chest_gap = estimated_percentile(1.0, 2.0, Zone.CHEST, Sex.FEMALE) - estimated_percentile(
        1.0, 2.0, Zone.CHEST, Sex.MALE
    )
    legs_gap = estimated_percentile(1.0, 2.0, Zone.LEGS, Sex.FEMALE) - estimated_percentile(
        1.0, 2.0, Zone.LEGS, Sex.MALE
    )

    assert legs_gap < chest_gap


def test_the_app_percentile_counts_ties_as_half() -> None:
    assert app_percentile(1.0, [0.5, 0.8, 1.0, 1.2]) == pytest.approx(2.5 / 4)
    assert app_percentile(2.0, [0.5, 0.8]) == 1.0
    assert app_percentile(0.1, [0.5, 0.8]) == 0.0


def test_a_zone_is_the_mean_of_its_exercises() -> None:
    assert zone_score([0.9, 0.5, 0.4]) == pytest.approx(0.6)


@pytest.mark.parametrize(
    ("score", "tier", "progress"),
    [
        (0.0, StrengthTier.BRONZE, 0.0),
        (0.10, StrengthTier.BRONZE, 0.5),
        (0.20, StrengthTier.SILVER, 0.0),
        (0.50, StrengthTier.GOLD, 0.5),
        (0.96, StrengthTier.RUBY, 0.5),
        (0.98, StrengthTier.MASTER, 1.0),
        (1.0, StrengthTier.MASTER, 1.0),
    ],
)
def test_tier_for_a_score(score: float, tier: StrengthTier, progress: float) -> None:
    result = tier_for(score)

    assert result.tier == tier
    assert result.progress == pytest.approx(progress)
