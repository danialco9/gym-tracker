from datetime import date

from gym_tracker.analysis import load_training_log
from gym_tracker.analysis.milestones import (
    BAR_STEPS,
    DUMBBELL_STEPS,
    Milestone,
    MilestoneKind,
    exercise_milestones,
    log_milestones,
)
from tests.conftest import WriteLog

WEIGHT = MilestoneKind.WEIGHT
GAIN = MilestoneKind.GAIN


def sessions(*tops: float) -> list[tuple[str, date, float]]:
    return [(f"w{index}", date(2026, 9, index + 1), top) for index, top in enumerate(tops)]


def test_the_first_session_is_the_starting_point_and_earns_nothing() -> None:
    assert exercise_milestones("bench", sessions(100), BAR_STEPS) == []


def test_reaching_a_round_weight_and_ten_more_kilos() -> None:
    # +5 kg on the second day is below the 10 kg step: nothing yet.
    assert exercise_milestones("bench", sessions(52.5, 57.5, 62.5), BAR_STEPS) == [
        Milestone("bench", WEIGHT, 60.0, date(2026, 9, 3), "w2"),
        Milestone("bench", GAIN, 10.0, date(2026, 9, 3), "w2"),
    ]


def test_a_round_weight_counts_once_even_after_a_dip() -> None:
    milestones = exercise_milestones("bench", sessions(55, 60, 50, 60, 61), BAR_STEPS)

    assert [(item.kind, item.value_kg, item.workout_id) for item in milestones] == [
        (WEIGHT, 60.0, "w1"),
    ]


def test_a_big_jump_earns_only_the_highest_round_weight_and_gain() -> None:
    milestones = exercise_milestones("squat", sessions(60, 100), BAR_STEPS)

    assert [(item.kind, item.value_kg) for item in milestones] == [(WEIGHT, 100.0), (GAIN, 40.0)]


def test_already_past_a_round_weight_on_the_first_day_is_not_a_milestone() -> None:
    milestones = exercise_milestones("bench", sessions(62.5, 70), BAR_STEPS)

    assert [(item.kind, item.value_kg) for item in milestones] == []


def test_dumbbells_count_in_smaller_steps() -> None:
    milestones = exercise_milestones("curl", sessions(8, 10, 13), DUMBBELL_STEPS)

    assert [(item.kind, item.value_kg, item.workout_id) for item in milestones] == [
        (WEIGHT, 10.0, "w1"),
        (GAIN, 5.0, "w2"),
    ]


def test_log_milestones_ignore_warmups_and_bodyweight_and_come_newest_first(write_log: WriteLog) -> None:
    data_dir = write_log(
        exercises="""
            bench-press,Press banca con barra,chest,triceps,barbell
            db-curl,Curl con mancuernas,biceps,,dumbbell
            pull-up,Dominadas,back,biceps,bodyweight
        """,
        workouts="""
            w1,2026-09-01,,
            w2,2026-09-08,,
            w3,2026-09-15,,
        """,
        workout_sets="""
            w1,bench-press,1,5,90,8,false
            w1,db-curl,1,10,8,8,false
            w1,pull-up,1,8,0,8,false
            w2,bench-press,1,3,100,,true
            w2,bench-press,2,5,92.5,8,false
            w2,db-curl,1,10,10,8,false
            w2,pull-up,1,8,10,8,false
            w3,bench-press,1,3,100,9,false
            w3,pull-up,1,8,20,8,false
        """,
    )

    milestones = log_milestones(load_training_log(data_dir))

    assert [(item.exercise_id, item.kind, item.value_kg, item.achieved_on) for item in milestones] == [
        ("bench-press", WEIGHT, 100.0, date(2026, 9, 15)),
        ("bench-press", GAIN, 10.0, date(2026, 9, 15)),
        ("db-curl", WEIGHT, 10.0, date(2026, 9, 8)),
    ]
