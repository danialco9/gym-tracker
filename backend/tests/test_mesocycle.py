from datetime import date

import pytest

from gym_tracker.analysis.mesocycle import BlockWeek, block_week, week_start

# A Monday.
START = date(2026, 11, 9)


def test_week_start_is_the_monday() -> None:
    assert week_start(date(2026, 11, 15)) == START  # Sunday
    assert week_start(START) == START


@pytest.mark.parametrize(
    ("today", "expected"),
    [
        (date(2026, 11, 9), BlockWeek(week=1, weeks=5, is_deload=False)),
        (date(2026, 11, 15), BlockWeek(week=1, weeks=5, is_deload=False)),
        (date(2026, 11, 16), BlockWeek(week=2, weeks=5, is_deload=False)),
        (date(2026, 12, 7), BlockWeek(week=5, weeks=5, is_deload=True)),
        # After the deload the next block starts on its own.
        (date(2026, 12, 14), BlockWeek(week=1, weeks=5, is_deload=False)),
        (date(2027, 1, 11), BlockWeek(week=5, weeks=5, is_deload=True)),
    ],
)
def test_the_block_week_follows_the_calendar_and_rolls_over(today: date, expected: BlockWeek) -> None:
    assert block_week(START, 5, today) == expected


def test_a_block_started_midweek_counts_from_that_monday() -> None:
    assert block_week(date(2026, 11, 12), 4, date(2026, 11, 16)).week == 2


def test_a_start_in_the_future_reads_as_the_first_week() -> None:
    assert block_week(START, 4, date(2026, 11, 1)).week == 1
