"""Training blocks (mesocycles): a few weeks of building that end in one lighter deload week.

Only the length and the Monday it started are stored. Which week of the block today falls in is
worked out from them, and once the deload week is over the next block starts on its own, so the
user never has to remember to begin one.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

MIN_BLOCK_WEEKS = 4
MAX_BLOCK_WEEKS = 6


@dataclass(frozen=True)
class BlockWeek:
    # 1-based week of the current block.
    week: int
    weeks: int
    # The last week of every block is the deload.
    is_deload: bool


def week_start(day: date) -> date:
    """The Monday of ``day``'s week."""
    return day - timedelta(days=day.weekday())


def block_week(started_on: date, weeks: int, today: date) -> BlockWeek:
    """Where ``today`` falls in a run of back-to-back blocks of ``weeks`` weeks from ``started_on``."""
    elapsed_weeks = (week_start(today) - week_start(started_on)).days // 7
    # A start in the future (a clock change, a hand-edited row) reads as the first week, not a negative one.
    week = max(elapsed_weeks, 0) % weeks + 1
    return BlockWeek(week=week, weeks=weeks, is_deload=week == weeks)


def in_deload_week(started_on: date, weeks: int, day: date) -> bool:
    """Whether ``day`` fell in a deload week of the blocks started on ``started_on``.

    Days before the first block never did: restarting a block leaves the history before it alone.
    """
    return day >= week_start(started_on) and block_week(started_on, weeks, day).is_deload
