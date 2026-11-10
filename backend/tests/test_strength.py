import pytest

from gym_tracker.analysis.strength import (
    BODYWEIGHT_LIFTS,
    GYM_GOER_PERCENTILES,
    MASTER_RATIOS,
    UNRANKED,
    ZONES,
    Standard,
    StrengthTier,
    Zone,
    estimated_max,
    estimated_percentile,
    master_ratio,
    standard_for,
    tier_for,
    zone_score,
)
from gym_tracker.analysis.strength_standards import (
    ADDED_WEIGHT_STANDARDS,
    FEMALE_BODY_WEIGHTS,
    FEMALE_STANDARDS,
    MALE_BODY_WEIGHTS,
    MALE_STANDARDS,
)
from gym_tracker.catalog import CATALOG
from gym_tracker.enums import Equipment, MuscleGroup, Sex

BENCH = Standard("bench-press", 1.0)


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


def test_a_standard_is_the_share_of_gym_goers_it_says() -> None:
    # A man of 80 kg on the bench press: 56, 75, 98, 124 and 151 kg.
    for max_kg, share in zip((56, 75, 98, 124, 151), GYM_GOER_PERCENTILES, strict=True):
        assert estimated_percentile(max_kg, 80, BENCH, Sex.MALE) == pytest.approx(share)


def test_a_lift_between_two_standards_lies_between_their_shares() -> None:
    assert 0.50 < estimated_percentile(85, 80, BENCH, Sex.MALE) < 0.80
    assert 0 < estimated_percentile(20, 80, BENCH, Sex.MALE) < 0.01
    assert 0.999 < estimated_percentile(250, 80, BENCH, Sex.MALE) < 1


def test_the_standards_follow_the_body_weight() -> None:
    # Between the rows of 80 kg (75 kg) and 85 kg (80 kg), the typical bench press is 77 kg.
    assert estimated_percentile(77, 82, BENCH, Sex.MALE) == pytest.approx(0.50)
    assert estimated_percentile(50, 50, BENCH, Sex.MALE) > 0.6
    assert estimated_percentile(50, 80, BENCH, Sex.MALE) < 0.2
    # Outside the table, its first and last rows.
    assert estimated_percentile(50, 40, BENCH, Sex.MALE) == estimated_percentile(50, 50, BENCH, Sex.MALE)
    assert estimated_percentile(150, 160, BENCH, Sex.MALE) == estimated_percentile(150, 140, BENCH, Sex.MALE)


def test_the_same_lift_ranks_higher_among_women_and_in_between_with_the_sex_unknown() -> None:
    men = estimated_percentile(60, 70, BENCH, Sex.MALE)
    women = estimated_percentile(60, 70, BENCH, Sex.FEMALE)
    everyone = estimated_percentile(60, 70, BENCH, None)

    assert men < everyone < women
    assert everyone == pytest.approx((men + women) / 2)


def test_pull_ups_count_the_body_with_the_added_weight() -> None:
    # A man of 80 kg: the typical one adds 14 kg, so lifts 94 kg.
    assert estimated_percentile(94, 80, Standard("pull-up", 1.0), Sex.MALE) == pytest.approx(0.50)


def test_every_table_has_a_row_per_body_weight_with_rising_standards() -> None:
    assert MALE_STANDARDS.keys() == FEMALE_STANDARDS.keys()
    for standards, body_weights in ((MALE_STANDARDS, MALE_BODY_WEIGHTS), (FEMALE_STANDARDS, FEMALE_BODY_WEIGHTS)):
        for lift, rows in standards.items():
            assert len(rows) == len(body_weights), lift
            for body_weight, row in zip(body_weights, rows, strict=True):
                lifted = [kg + (body_weight if lift in ADDED_WEIGHT_STANDARDS else 0) for kg in row]
                assert lifted[0] > 0, (lift, body_weight)
                assert lifted == sorted(set(lifted)), (lift, body_weight)


def test_every_ranked_catalog_exercise_has_standards() -> None:
    for exercise in CATALOG:
        standard = standard_for(exercise.slug, exercise.muscle_group, exercise.equipment)
        ranked = master_ratio(exercise.slug, exercise.muscle_group, exercise.equipment) is not None

        assert (standard is not None) == ranked, exercise.slug
        if standard is not None:
            assert standard.lift in MALE_STANDARDS
            assert standard.factor > 0


def test_an_exercise_without_standards_borrows_them_from_a_similar_lift() -> None:
    # The incline bench press reaches 1.7x body weight where the bench press reaches 2.0x.
    incline = standard_for("incline-bench-press", MuscleGroup.CHEST, Equipment.BARBELL)
    assert incline is not None
    assert incline.lift == "bench-press"
    assert incline.factor == pytest.approx(2.0 / 1.7)
    assert estimated_percentile(75 * 1.7 / 2.0, 80, incline, Sex.MALE) == pytest.approx(0.50)

    hammer_curl = standard_for("hammer-curl", MuscleGroup.BICEPS, Equipment.DUMBBELL)
    chin_up = standard_for("chin-up", MuscleGroup.BACK, Equipment.BODYWEIGHT)
    assert hammer_curl is not None
    assert hammer_curl.lift == "dumbbell-curl"
    assert chin_up is not None
    assert chin_up.lift == "pull-up"
    assert standard_for("leg-press", MuscleGroup.QUADS, Equipment.MACHINE) == Standard("leg-press", 1.0)
    assert standard_for("crunch", MuscleGroup.ABS, Equipment.BODYWEIGHT) is None


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
