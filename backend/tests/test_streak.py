from datetime import date

from gym_tracker.analysis import Streak, load_training_log, log_streak, training_streak
from tests.conftest import WriteLog

TODAY = date(2026, 10, 21)  # a Wednesday


def test_one_rest_day_keeps_the_streak_alive() -> None:
    # Monday, Wednesday and Friday, then the weekend off.
    days = [date(2026, 10, 12), date(2026, 10, 14), date(2026, 10, 16)]

    assert training_streak(days, date(2026, 10, 17)) == Streak(
        current_days=5, best_days=5, last_workout_on=date(2026, 10, 16), at_risk=False
    )
    # Saturday was the rest day: Sunday is the last chance.
    assert training_streak(days, date(2026, 10, 18)).at_risk
    # Two days off in a row end it, though the best one is kept.
    assert training_streak(days, date(2026, 10, 19)) == Streak(
        current_days=0, best_days=5, last_workout_on=date(2026, 10, 16), at_risk=False
    )


def test_two_rest_days_start_a_new_streak() -> None:
    days = [date(2026, 10, 1), date(2026, 10, 2), date(2026, 10, 3), date(2026, 10, 6), date(2026, 10, 7)]

    streak = training_streak(days, date(2026, 10, 7))

    assert (streak.current_days, streak.best_days) == (2, 3)


def test_no_workouts_no_streak() -> None:
    assert training_streak([], TODAY) == Streak(current_days=0, best_days=0, last_workout_on=None, at_risk=False)


def test_the_streak_comes_from_the_days_with_workouts(write_log: WriteLog) -> None:
    data_dir = write_log(
        exercises="bench,Press banca,chest,triceps,barbell",
        workouts="""
            w1,2026-10-12,,
            w2,2026-10-14,,
            w3,2026-10-19,,
            w4,2026-10-20,,
        """,
        workout_sets="""
            w1,bench,1,8,60,,false
            w2,bench,1,8,60,,false
            w3,bench,1,8,60,,false
            w4,bench,1,8,60,,false
        """,
    )

    # Monday and Wednesday make three days; four days off, then Monday and Tuesday make two.
    assert log_streak(load_training_log(data_dir), TODAY) == Streak(
        current_days=2, best_days=3, last_workout_on=date(2026, 10, 20), at_risk=False
    )
