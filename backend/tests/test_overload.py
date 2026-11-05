from datetime import date

from gym_tracker.analysis import OverloadVerdict, SetLoad, load_training_log, week_overload
from gym_tracker.analysis.overload import compare_set
from tests.conftest import WriteLog

# A Wednesday: this week started on Monday 2026-09-14.
TODAY = date(2026, 9, 16)

EXERCISES = """
    bench-press,Press banca con barra,chest,triceps,barbell
    back-squat,Sentadilla con barra,quads,glutes,barbell
    barbell-row,Remo con barra,back,biceps,barbell
    barbell-curl,Curl con barra,biceps,,barbell
    leg-press,Prensa de piernas,quads,glutes,machine
"""


def test_compare_set_counts_more_weight_or_more_reps_at_the_same_weight() -> None:
    last = SetLoad(weight_kg=80, reps=8)

    assert compare_set(SetLoad(82.5, 6), last) is OverloadVerdict.BEATEN
    assert compare_set(SetLoad(80, 9), last) is OverloadVerdict.BEATEN
    assert compare_set(SetLoad(80, 8), last) is OverloadVerdict.MATCHED
    assert compare_set(SetLoad(80, 7), last) is OverloadVerdict.BELOW
    assert compare_set(SetLoad(77.5, 12), last) is OverloadVerdict.BELOW


def test_week_overload_compares_this_week_with_the_session_before(write_log: WriteLog) -> None:
    data_dir = write_log(
        exercises=EXERCISES,
        workouts="""
            w1,2026-09-07,,
            w2,2026-09-15,,
        """,
        workout_sets="""
            w1,bench-press,1,8,80,8,false
            w1,bench-press,2,8,80,8,false
            w1,back-squat,1,6,100,8,false
            w1,barbell-row,1,10,60,8,false
            w1,barbell-curl,1,10,30,8,false
            w2,bench-press,1,20,40,,true
            w2,bench-press,2,8,80,8,false
            w2,bench-press,3,9,80,9,false
            w2,back-squat,1,6,100,8,false
            w2,barbell-row,1,8,60,9,false
            w2,barbell-curl,1,10,30,8,false
            w2,leg-press,1,10,150,8,false
        """,
    )

    overload = week_overload(load_training_log(data_dir), TODAY)

    # Beaten first, then matched, then below; the leg press is new, so it has nothing to beat yet.
    assert [(item.exercise_name, item.verdict) for item in overload] == [
        ("Press banca con barra", OverloadVerdict.BEATEN),
        ("Curl con barra", OverloadVerdict.MATCHED),
        ("Sentadilla con barra", OverloadVerdict.MATCHED),
        ("Remo con barra", OverloadVerdict.BELOW),
    ]
    # The warm-up is left out, so the second working set is the one that beat the time before.
    bench = overload[0]
    assert (bench.current, bench.previous) == (SetLoad(80, 9), SetLoad(80, 8))
    row = overload[-1]
    assert (row.current, row.previous) == (SetLoad(60, 8), SetLoad(60, 10))


def test_week_overload_leaves_out_exercises_not_trained_this_week(write_log: WriteLog) -> None:
    data_dir = write_log(
        exercises=EXERCISES,
        workouts="""
            w1,2026-09-01,,
            w2,2026-09-08,,
        """,
        workout_sets="""
            w1,bench-press,1,8,80,8,false
            w2,bench-press,1,9,80,8,false
        """,
    )

    assert week_overload(load_training_log(data_dir), TODAY) == []
    assert week_overload(load_training_log(write_log()), TODAY) == []


def test_week_overload_uses_the_latest_session_of_the_week(write_log: WriteLog) -> None:
    data_dir = write_log(
        exercises=EXERCISES,
        workouts="""
            w1,2026-09-07,,
            w2,2026-09-14,,
            w3,2026-09-16,,
        """,
        workout_sets="""
            w1,bench-press,1,8,80,8,false
            w2,bench-press,1,8,82.5,8,false
            w3,bench-press,1,6,82.5,9,false
        """,
    )

    [bench] = week_overload(load_training_log(data_dir), TODAY)

    # Wednesday's session is set against Monday's, not against last week.
    assert bench.verdict is OverloadVerdict.BELOW
    assert (bench.current, bench.previous) == (SetLoad(82.5, 6), SetLoad(82.5, 8))
