from datetime import date, timedelta
from functools import partial
from pathlib import Path

import pytest

from gym_tracker.analysis import (
    Action,
    PerformedSet,
    PlannedSet,
    Reason,
    VolumeStatus,
    current_week_sets,
    decide_deload_week,
    decide_progression,
    load_increment,
    load_training_log,
    recommend,
    volume_advice,
)
from gym_tracker.analysis.mesocycle import in_deload_week
from tests.conftest import WriteLog

STRAIGHT_PLAN = [PlannedSet(reps=10, weight_kg=60)] * 3


def performed(*sets: tuple[float, int], rpe: float | None = 8.0) -> list[PerformedSet]:
    return [PerformedSet(reps=reps, weight_kg=weight, rpe=rpe) for weight, reps in sets]


@pytest.mark.parametrize(
    ("done", "stalled", "expected_action", "expected_reason", "expected_weights"),
    [
        (
            performed((60, 10), (60, 10), (60, 10)),
            False,
            Action.INCREASE_LOAD,
            Reason.TARGETS_HIT,
            [62.5, 62.5, 62.5],
        ),
        (
            performed((60, 10), (60, 10), (60, 10), rpe=None),
            False,
            Action.INCREASE_LOAD,
            Reason.TARGETS_HIT,
            [62.5, 62.5, 62.5],
        ),
        (
            performed((60, 10), (60, 10), (60, 10), rpe=9.5),
            False,
            Action.HOLD,
            Reason.TARGETS_HIT_HARD,
            [60, 60, 60],
        ),
        (
            performed((60, 10), (60, 9), (60, 8)),
            False,
            Action.INCREASE_REPS,
            Reason.TARGETS_MISSED,
            [60, 60, 60],
        ),
        # A missing set counts as a missed target, and its weight comes from the plan.
        (performed((60, 10), (60, 10)), False, Action.INCREASE_REPS, Reason.TARGETS_MISSED, [60, 60, 60]),
        (performed((60, 10), (60, 10), (60, 10)), True, Action.DELOAD, Reason.PLATEAU, [52.5, 52.5, 52.5]),
    ],
)
def test_decide_progression_with_straight_sets(
    done: list[PerformedSet],
    stalled: bool,
    expected_action: Action,
    expected_reason: Reason,
    expected_weights: list[float],
) -> None:
    progression = decide_progression(performed=done, planned=STRAIGHT_PLAN, stalled=stalled)

    assert progression.action is expected_action
    assert progression.reason is expected_reason
    assert [item.weight_kg for item in progression.suggested_sets] == expected_weights
    assert [item.reps for item in progression.suggested_sets] == [10, 10, 10]


def test_decide_progression_keeps_the_shape_of_a_pyramid() -> None:
    plan = [PlannedSet(reps=12, weight_kg=60), PlannedSet(reps=10, weight_kg=70), PlannedSet(reps=8, weight_kg=80)]

    progression = decide_progression(performed=performed((60, 12), (72.5, 10), (82.5, 8)), planned=plan, stalled=False)

    assert progression.action is Action.INCREASE_LOAD
    assert progression.suggested_sets == (PlannedSet(12, 62.5), PlannedSet(10, 75.0), PlannedSet(8, 85.0))

    missed = decide_progression(performed=performed((60, 12), (72.5, 10), (82.5, 6)), planned=plan, stalled=False)
    assert missed.action is Action.INCREASE_REPS


@pytest.mark.parametrize(
    ("rpe", "expected"),
    [
        (6.0, (Action.INCREASE_LOAD, Reason.EASY_WITHOUT_PLAN, [42.5, 42.5])),
        (8.5, (Action.INCREASE_REPS, Reason.WITHOUT_PLAN, [40, 40])),
        (None, (Action.INCREASE_REPS, Reason.WITHOUT_PLAN, [40, 40])),
    ],
)
def test_decide_progression_without_a_plan(rpe: float | None, expected: tuple[Action, Reason, list[float]]) -> None:
    progression = decide_progression(performed=performed((40, 12), (40, 12), rpe=rpe), planned=[], stalled=False)

    weights = [item.weight_kg for item in progression.suggested_sets]
    assert (progression.action, progression.reason, weights) == expected
    assert [item.reps for item in progression.suggested_sets] == [12, 12]


@pytest.mark.parametrize(
    ("equipment", "muscle_group", "expected"),
    [
        ("barbell", "chest", 2.5),
        ("dumbbell", "shoulders", 2.0),
        ("kettlebell", "glutes", 4.0),
        # Legs move more weight: the same step would take months to add up.
        ("barbell", "quads", 5.0),
        ("machine", "quads", 5.0),
        ("dumbbell", "quads", 2.0),
        (None, None, 2.5),
    ],
)
def test_load_increment_depends_on_the_equipment(
    equipment: str | None, muscle_group: str | None, expected: float
) -> None:
    assert load_increment(equipment, muscle_group) == expected


def test_a_jump_too_big_for_the_weight_asks_for_reps_first() -> None:
    # 2 kg more on 6 kg dumbbells is +33%: nobody hits the same reps after that.
    plan = [PlannedSet(reps=12, weight_kg=6)] * 3

    first = decide_progression(
        performed=performed((6, 12), (6, 12), (6, 12), rpe=7), planned=plan, stalled=False, increment_kg=2.0
    )
    assert (first.action, first.reason) == (Action.INCREASE_REPS, Reason.JUMP_TOO_BIG)
    assert first.suggested_sets == (PlannedSet(13, 6),) * 3

    # Two reps over the target on every set earn the jump.
    earned = decide_progression(
        performed=performed((6, 14), (6, 14), (6, 14), rpe=7), planned=plan, stalled=False, increment_kg=2.0
    )
    assert (earned.action, earned.reason) == (Action.INCREASE_LOAD, Reason.TARGETS_HIT)
    assert earned.suggested_sets == (PlannedSet(12, 8),) * 3


def test_reps_first_never_asks_for_fewer_reps_than_were_done() -> None:
    plan = [PlannedSet(reps=12, weight_kg=6)] * 2

    # The first set went past the ceiling (14), the second is still below it.
    progression = decide_progression(
        performed=performed((6, 16), (6, 12), rpe=7), planned=plan, stalled=False, increment_kg=2.0
    )

    assert progression.reason is Reason.JUMP_TOO_BIG
    assert [item.reps for item in progression.suggested_sets] == [16, 13]


def test_a_jump_within_ten_percent_is_taken_at_once() -> None:
    plan = [PlannedSet(reps=10)] * 2

    progression = decide_progression(
        performed=performed((25, 10), (25, 10), rpe=8), planned=plan, stalled=False, increment_kg=2.5
    )

    assert progression.action is Action.INCREASE_LOAD
    assert [item.weight_kg for item in progression.suggested_sets] == [27.5, 27.5]


def test_recommend_uses_latest_session_and_routine_targets(write_log: WriteLog) -> None:
    data_dir = write_log(
        exercises="lat-pulldown,Jalón al pecho,back,biceps,machine",
        routines="pull,Pull,",
        routine_exercises="""
            pull,lat-pulldown,1,1,10,,8
            pull,lat-pulldown,1,2,10,,8
            pull,lat-pulldown,1,3,10,,8
        """,
        workouts="""
            w1,2026-09-08,pull,
            w2,2026-09-15,pull,
        """,
        workout_sets="""
            w1,lat-pulldown,1,8,50,9,false
            w2,lat-pulldown,1,12,30,,true
            w2,lat-pulldown,2,10,50,7,false
            w2,lat-pulldown,3,10,50,8,false
            w2,lat-pulldown,4,10,50,8,false
        """,
    )

    [recommendation] = recommend(load_training_log(data_dir))

    assert recommendation.exercise_name == "Jalón al pecho"
    assert recommendation.action is Action.INCREASE_LOAD
    assert recommendation.reason is Reason.TARGETS_HIT
    assert recommendation.increment_kg == 2.5
    assert recommendation.last_performed_on == date(2026, 9, 15)
    assert [item.reps for item in recommendation.last_sets] == [10, 10, 10]
    assert recommendation.target_sets == (PlannedSet(reps=10),) * 3
    assert recommendation.suggested_sets == (PlannedSet(reps=10, weight_kg=52.5),) * 3


def test_recommend_empty_log(write_log: WriteLog) -> None:
    assert recommend(load_training_log(write_log())) == []


def test_recommend_leaves_out_exercises_not_trained_for_weeks(write_log: WriteLog) -> None:
    data_dir = write_log(
        exercises="""
            back-squat,Sentadilla con barra,quads,glutes,barbell
            leg-press,Prensa de piernas,quads,glutes,machine
        """,
        workouts="""
            w1,2026-07-01,,
            w2,2026-09-15,,
        """,
        workout_sets="""
            w1,back-squat,1,5,100,7,false
            w2,leg-press,1,10,150,7,false
        """,
    )
    log = load_training_log(data_dir)

    assert {item.exercise_id for item in recommend(log)} == {"back-squat", "leg-press"}
    [current] = recommend(log, today=date(2026, 9, 16))
    assert current.exercise_id == "leg-press"
    # A machine leg lift moves in 5 kg steps.
    assert current.increment_kg == 5.0
    assert [item.weight_kg for item in current.suggested_sets] == [155.0]


@pytest.mark.parametrize(("set_count", "kept"), [(4, 2), (3, 2), (1, 1)])
def test_a_deload_week_keeps_the_weights_with_half_the_sets(set_count: int, kept: int) -> None:
    plan = [PlannedSet(reps=10, weight_kg=60)] * set_count
    done = performed(*[(60, 10)] * set_count, rpe=7)

    progression = decide_deload_week(performed=done, planned=plan)

    assert (progression.action, progression.reason) == (Action.HOLD, Reason.DELOAD_WEEK)
    assert progression.suggested_sets == (PlannedSet(reps=10, weight_kg=60),) * kept


def _block_log(write_log: WriteLog) -> Path:
    """A normal session, then a lighter one in the deload week of a two-week block started 2026-09-07."""
    return write_log(
        exercises="lat-pulldown,Jalón al pecho,back,biceps,machine",
        routines="pull,Pull,",
        routine_exercises="""
            pull,lat-pulldown,1,1,10,,8
            pull,lat-pulldown,1,2,10,,8
            pull,lat-pulldown,1,3,10,,8
        """,
        workouts="""
            w1,2026-09-08,pull,
            w2,2026-09-15,pull,
        """,
        workout_sets="""
            w1,lat-pulldown,1,10,50,8,false
            w1,lat-pulldown,2,10,50,8,false
            w1,lat-pulldown,3,10,50,8,false
            w2,lat-pulldown,1,10,50,6,false
            w2,lat-pulldown,2,10,50,6,false
        """,
    )


def test_recommend_in_a_deload_week_halves_the_sets(write_log: WriteLog) -> None:
    log = load_training_log(_block_log(write_log))
    in_deload = partial(in_deload_week, date(2026, 9, 7), 2)

    [recommendation] = recommend(log, today=date(2026, 9, 17), in_deload=in_deload)

    assert (recommendation.action, recommendation.reason) == (Action.HOLD, Reason.DELOAD_WEEK)
    assert recommendation.suggested_sets == (PlannedSet(reps=10, weight_kg=50),) * 2


def test_recommend_after_a_deload_week_builds_on_the_session_before_it(write_log: WriteLog) -> None:
    log = load_training_log(_block_log(write_log))
    in_deload = partial(in_deload_week, date(2026, 9, 7), 2)

    # Without blocks the two light sets read as targets missed.
    [unaware] = recommend(log, today=date(2026, 9, 22))
    assert unaware.reason is Reason.TARGETS_MISSED

    [recommendation] = recommend(log, today=date(2026, 9, 22), in_deload=in_deload)
    assert (recommendation.action, recommendation.reason) == (Action.INCREASE_LOAD, Reason.TARGETS_HIT)
    assert recommendation.last_performed_on == date(2026, 9, 8)
    assert recommendation.suggested_sets == (PlannedSet(reps=10, weight_kg=52.5),) * 3


def _weekly_log(write_log: WriteLog, chest_sets_per_week: int, weeks: int) -> Path:
    """Monday sessions from 2026-08-17 with only bench press, ``chest_sets_per_week`` sets each."""
    workouts = "\n".join(f"w{week},{date(2026, 8, 17) + timedelta(weeks=week)},," for week in range(weeks))
    sets = "\n".join(
        f"w{week},bench-press,{number},8,60,8,false"
        for week in range(weeks)
        for number in range(1, chest_sets_per_week + 1)
    )
    return write_log(
        exercises="bench-press,Press banca con barra,chest,triceps,barbell",
        workouts=workouts,
        workout_sets=sets,
    )


def test_volume_advice_flags_main_muscles_outside_the_range(write_log: WriteLog) -> None:
    log = load_training_log(_weekly_log(write_log, chest_sets_per_week=24, weeks=5))

    advice = {item.muscle_group: item for item in volume_advice(log, today=date(2026, 9, 16))}

    # Four complete weeks before the current one: 24 chest sets a week is too many...
    assert advice["chest"].status is VolumeStatus.HIGH
    assert advice["chest"].average_hard_sets == 24.0
    assert advice["chest"].weeks == 4
    # ...and every main muscle never trained reads as too little.
    assert advice["back"].status is VolumeStatus.LOW
    assert advice["back"].average_hard_sets == 0.0
    # Smaller muscles are not judged.
    assert "calves" not in advice


def test_volume_advice_accepts_the_recommended_range(write_log: WriteLog) -> None:
    log = load_training_log(_weekly_log(write_log, chest_sets_per_week=12, weeks=5))

    assert "chest" not in {item.muscle_group for item in volume_advice(log, today=date(2026, 9, 16))}


def test_volume_advice_counts_secondary_muscles_as_half_a_set(write_log: WriteLog) -> None:
    data_dir = write_log(
        exercises="back-squat,Sentadilla con barra,quads,glutes;adductors,barbell",
        workouts="\n".join(f"w{week},{date(2026, 8, 17) + timedelta(weeks=week)},," for week in range(5)),
        workout_sets="\n".join(
            f"w{week},back-squat,{number},5,100,8,false" for week in range(5) for number in range(1, 13)
        ),
    )

    advice = {item.muscle_group: item for item in volume_advice(load_training_log(data_dir), date(2026, 9, 16))}

    # 12 squat sets a week: in range for the quads, 6 for the glutes.
    assert "quads" not in advice
    assert advice["glutes"].average_hard_sets == 6.0


def test_volume_advice_waits_for_two_complete_weeks(write_log: WriteLog) -> None:
    data_dir = write_log(
        exercises="bench-press,Press banca con barra,chest,triceps,barbell",
        workouts="w1,2026-09-09,,",
        workout_sets="w1,bench-press,1,8,60,8,false",
    )

    # One complete week (from 2026-09-07) and the current, unfinished one.
    assert volume_advice(load_training_log(data_dir), today=date(2026, 9, 16)) == []


def test_current_week_sets_count_only_this_week(write_log: WriteLog) -> None:
    log = load_training_log(_weekly_log(write_log, chest_sets_per_week=12, weeks=5))

    # Wednesday 2026-09-16: only the Monday session of this week counts, triceps at half a set each.
    week = {item.muscle_group: item.hard_sets for item in current_week_sets(log, today=date(2026, 9, 16))}

    assert week["chest"] == 12.0
    assert week["triceps"] == 6.0
    assert week["back"] == 0.0
    # Every main muscle and nothing else, so the app can paint the whole body.
    assert set(week) == {"chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes"}


def test_current_week_sets_start_from_zero(write_log: WriteLog) -> None:
    log = load_training_log(_weekly_log(write_log, chest_sets_per_week=12, weeks=4))

    # The new week has no workouts yet; an empty log reads the same.
    assert {item.hard_sets for item in current_week_sets(log, today=date(2026, 9, 16))} == {0.0}
    assert {item.hard_sets for item in current_week_sets(load_training_log(write_log()), date(2026, 9, 16))} == {0.0}
