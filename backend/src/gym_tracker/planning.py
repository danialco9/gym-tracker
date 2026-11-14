"""The week plan: what each day holds, from the usual week and the changes made for single dates."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, timedelta

from gym_tracker.enums import PlanKind

DAYS_IN_WEEK = 7


@dataclass(frozen=True)
class DayPlan:
    on_date: date
    kind: PlanKind
    routine_id: int | None
    # Whether a change for this date replaced what the usual week holds.
    changed: bool


def week_start(day: date) -> date:
    """The Monday of the week ``day`` falls in."""
    return day - timedelta(days=day.weekday())


def usual_day(weekday: int, usual: Mapping[int, int | None]) -> tuple[PlanKind, int | None]:
    """What the usual week holds on a weekday: its routine, a free workout when it has none, or rest."""
    if weekday not in usual:
        return PlanKind.REST, None
    routine_id = usual[weekday]
    return (PlanKind.FREE, None) if routine_id is None else (PlanKind.ROUTINE, routine_id)


def resolve_week(
    start: date,
    usual: Mapping[int, int | None],
    changes: Mapping[date, tuple[PlanKind, int | None]],
) -> list[DayPlan]:
    """The seven days from the Monday of ``start``.

    ``usual`` maps each training weekday (Monday is 0) to its routine, or to None for a free
    workout; the other weekdays rest. ``changes`` say what single dates hold instead.
    """
    monday = week_start(start)
    days = []
    for offset in range(DAYS_IN_WEEK):
        on_date = monday + timedelta(days=offset)
        if on_date in changes:
            kind, routine_id = changes[on_date]
            days.append(DayPlan(on_date, kind, routine_id, changed=True))
        else:
            kind, routine_id = usual_day(on_date.weekday(), usual)
            days.append(DayPlan(on_date, kind, routine_id, changed=False))
    return days
