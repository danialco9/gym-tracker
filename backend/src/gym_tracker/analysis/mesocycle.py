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


def current_block_week(started_on: date | None, weeks: int | None, today: date) -> BlockWeek | None:
    """``block_week`` for someone who may not train in blocks (both values stored as null)."""
    if started_on is None or weeks is None:
        return None
    return block_week(started_on, weeks, today)


def week_set_target(block: BlockWeek | None, min_sets: int, max_sets: int) -> int:
    """Hard sets each main muscle aims for this week.

    Without blocks it is the minimum of the goal's range. In a block the building weeks climb from the
    minimum in the first week to the maximum in the last one before the deload, so the extra work
    arrives a little at a time and the fatigue it builds is cleared by the deload, which aims for half
    the minimum (rounded up).
    """
    if block is None:
        return min_sets
    if block.is_deload:
        return -(-min_sets // 2)
    building_weeks = block.weeks - 1
    if building_weeks <= 1:
        return min_sets
    return min_sets + round((max_sets - min_sets) * (block.week - 1) / (building_weeks - 1))


def in_deload_week(started_on: date, weeks: int, day: date) -> bool:
    """Whether ``day`` fell in a deload week of the blocks started on ``started_on``.

    Days before the first block never did: restarting a block leaves the history before it alone.
    """
    return day >= week_start(started_on) and block_week(started_on, weeks, day).is_deload
