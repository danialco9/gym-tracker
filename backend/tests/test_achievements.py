from datetime import date, timedelta

import pytest

from gym_tracker.analysis import (
    BadgeKind,
    Level,
    MissionKind,
    Streak,
    achievements,
    level_for,
    load_training_log,
    training_streak,
)
from tests.conftest import WriteLog

TODAY = date(2026, 10, 21)  # a Wednesday


@pytest.mark.parametrize(
    ("xp", "expected"),
    [
        (0, Level(number=1, xp=0, level_xp=0, level_size_xp=100)),
        (99, Level(number=1, xp=99, level_xp=99, level_size_xp=100)),
        (100, Level(number=2, xp=100, level_xp=0, level_size_xp=200)),
        (350, Level(number=3, xp=350, level_xp=50, level_size_xp=300)),
    ],
)
def test_each_level_asks_a_little_more(xp: int, expected: Level) -> None:
    assert level_for(xp) == expected


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


def test_achievements_add_up_the_history(write_log: WriteLog) -> None:
    data_dir = write_log(
        exercises="bench,Press banca,chest,triceps,barbell",
        workouts="""
            w1,2026-10-12,,
            w2,2026-10-14,,
            w3,2026-10-19,,
        """,
        workout_sets="""
            w1,bench,1,10,40,,true
            w1,bench,2,8,60,,false
            w1,bench,3,8,60,,false
            w2,bench,1,8,62.5,,false
            w3,bench,1,8,60,,false
        """,
    )

    result = achievements(load_training_log(data_dir), TODAY)

    # 3 workouts, 4 working sets (the warm-up does not count), one record (w2 beats w1) and with it
    # that week's record mission.
    assert result.level.xp == 3 * 10 + 4 + 25 + 30
    assert result.streak.current_days == 1
    assert {mission.kind: mission.progress for mission in result.missions} == {
        MissionKind.TRAINING_DAYS: 1,
        MissionKind.HARD_SETS: 1,
        MissionKind.RECORDS: 0,
    }
    earned = {badge.kind: badge.earned_on for badge in result.badges}
    assert earned[BadgeKind.FIRST_WORKOUT] == date(2026, 10, 12)
    assert earned[BadgeKind.FIRST_RECORD] == date(2026, 10, 14)
    assert earned[BadgeKind.WORKOUTS_10] is None


def test_completed_missions_earn_xp_and_a_long_streak_a_badge(write_log: WriteLog) -> None:
    # Every other day for two weeks, ten sets each: three training days and 30 sets every week.
    first = date(2026, 10, 5)
    days = [first + timedelta(days=offset) for offset in range(0, 15, 2)]
    data_dir = write_log(
        exercises="row,Remo,back,biceps,cable",
        workouts="\n".join(f"w{day:%d},{day:%Y-%m-%d},," for day in days),
        workout_sets="\n".join(f"w{day:%d},row,{number},10,50,,false" for day in days for number in range(1, 11)),
    )

    result = achievements(load_training_log(data_dir), date(2026, 10, 19))

    # 8 workouts, 80 sets, no records (same weight every time), the two missions of both weeks.
    assert result.level.xp == 8 * 10 + 80 + 2 * 2 * 30
    assert result.streak.current_days == 15
    assert {badge.kind: badge.earned_on for badge in result.badges}[BadgeKind.STREAK_7] == date(2026, 10, 11)
