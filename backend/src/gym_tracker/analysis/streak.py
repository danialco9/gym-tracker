"""The training streak: days in a row with workouts, derived from the log.

Nothing here is stored: it is recomputed from the workouts, so editing or deleting a workout can
never leave the streak out of step with the history it came from.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from gym_tracker.analysis.loader import TrainingLog

# A single day off between workouts keeps the streak alive; two in a row end it.
MAX_REST_DAYS = 1


@dataclass(frozen=True)
class Streak:
    current_days: int
    best_days: int
    last_workout_on: date | None
    # Training today is the only way to keep it: one more day off would end it.
    at_risk: bool


def streak_chains(days: Iterable[date]) -> list[list[date]]:
    """Training days grouped into streaks: runs where no more than ``MAX_REST_DAYS`` are skipped."""
    chains: list[list[date]] = []
    for day in sorted(set(days)):
        if chains and (day - chains[-1][-1]).days <= MAX_REST_DAYS + 1:
            chains[-1].append(day)
        else:
            chains.append([day])
    return chains


def _chain_days(chain: list[date]) -> int:
    """A streak counts calendar days, rest days included: Monday, Wednesday and Friday make five."""
    return (chain[-1] - chain[0]).days + 1


def training_streak(days: Iterable[date], today: date) -> Streak:
    chains = streak_chains(days)
    if not chains:
        return Streak(current_days=0, best_days=0, last_workout_on=None, at_risk=False)
    last = chains[-1]
    days_off = (today - last[-1]).days
    alive = days_off <= MAX_REST_DAYS + 1
    return Streak(
        current_days=_chain_days(last) if alive else 0,
        best_days=max(_chain_days(chain) for chain in chains),
        last_workout_on=last[-1],
        at_risk=alive and days_off == MAX_REST_DAYS + 1,
    )


def log_streak(log: TrainingLog, today: date) -> Streak:
    """The streak of the days with a workout in ``log``."""
    return training_streak((timestamp.date() for timestamp in log.workouts["date"]), today)
