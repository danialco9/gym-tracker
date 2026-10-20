"""Experience, levels, the training streak, weekly missions and badges, all derived from the log.

Nothing here is stored: every number is recomputed from the workouts, so editing or deleting a
workout can never leave the score out of step with the history it came from.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum

import pandas as pd

from gym_tracker.analysis.loader import TrainingLog
from gym_tracker.analysis.metrics import session_bests, working_sets

XP_PER_WORKOUT = 10
XP_PER_SET = 1
XP_PER_RECORD = 25
XP_PER_MISSION = 30
# Going from level n to n + 1 takes n times this, so each level asks a little more than the last.
LEVEL_STEP_XP = 100
# A single day off between workouts keeps the streak alive; two in a row end it.
MAX_REST_DAYS = 1


class MissionKind(StrEnum):
    TRAINING_DAYS = "training_days"
    HARD_SETS = "hard_sets"
    RECORDS = "records"


# The same three every week, from Monday to Sunday.
WEEKLY_MISSIONS: dict[MissionKind, int] = {
    MissionKind.TRAINING_DAYS: 3,
    MissionKind.HARD_SETS: 30,
    MissionKind.RECORDS: 1,
}


class BadgeKind(StrEnum):
    FIRST_WORKOUT = "first_workout"
    WORKOUTS_10 = "workouts_10"
    WORKOUTS_50 = "workouts_50"
    WORKOUTS_100 = "workouts_100"
    FIRST_RECORD = "first_record"
    RECORDS_10 = "records_10"
    STREAK_7 = "streak_7"
    STREAK_30 = "streak_30"


@dataclass(frozen=True)
class Level:
    number: int
    xp: int
    # XP gained since this level began, and what the whole level takes.
    level_xp: int
    level_size_xp: int


@dataclass(frozen=True)
class Streak:
    current_days: int
    best_days: int
    last_workout_on: date | None
    # Training today is the only way to keep it: one more day off would end it.
    at_risk: bool


@dataclass(frozen=True)
class Mission:
    kind: MissionKind
    progress: int
    target: int

    @property
    def done(self) -> bool:
        return self.progress >= self.target


@dataclass(frozen=True)
class Badge:
    kind: BadgeKind
    earned_on: date | None


@dataclass(frozen=True)
class Achievements:
    level: Level
    streak: Streak
    missions: tuple[Mission, ...]
    badges: tuple[Badge, ...]


def level_for(xp: int) -> Level:
    """The level reached with ``xp``: 100 XP to level 2, 200 more to level 3, and so on."""
    number, start = 1, 0
    while xp >= start + number * LEVEL_STEP_XP:
        start += number * LEVEL_STEP_XP
        number += 1
    return Level(number=number, xp=xp, level_xp=xp - start, level_size_xp=number * LEVEL_STEP_XP)


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


def _daily_totals(log: TrainingLog) -> pd.DataFrame:
    """Workouts, working sets and personal records per training day, in date order."""
    workouts = log.workouts.assign(day=log.workouts["date"].dt.normalize()).groupby("day").size()
    work = working_sets(log)
    sets = work.assign(day=work["date"].dt.normalize()).groupby("day").size()
    bests = session_bests(work)
    # A record beats every earlier session of the exercise; the first session has nothing to beat.
    previous_best = bests.groupby("exercise_id")["best_e1rm_kg"].transform(lambda best: best.cummax().shift())
    records = bests[bests["best_e1rm_kg"] > previous_best]
    records_per_day = records.assign(day=records["date"].dt.normalize()).groupby("day").size()
    totals = pd.DataFrame({"workouts": workouts, "sets": sets, "records": records_per_day})
    return totals.fillna(0).astype(int).sort_index()


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _missions(totals: pd.DataFrame, week_start: date) -> tuple[Mission, ...]:
    start = pd.Timestamp(week_start)
    week = totals[(totals.index >= start) & (totals.index < start + pd.Timedelta(days=7))]
    progress = {
        MissionKind.TRAINING_DAYS: len(week),
        MissionKind.HARD_SETS: int(week["sets"].sum()),
        MissionKind.RECORDS: int(week["records"].sum()),
    }
    return tuple(Mission(kind=kind, progress=progress[kind], target=target) for kind, target in WEEKLY_MISSIONS.items())


def _first_day_reaching(cumulative: pd.Series, threshold: int) -> date | None:
    reached = cumulative[cumulative >= threshold]
    return None if reached.empty else reached.index[0].date()


def _streak_day_reaching(chains: list[list[date]], length: int) -> date | None:
    for chain in chains:
        for day in chain:
            if (day - chain[0]).days + 1 >= length:
                return day
    return None


def achievements(log: TrainingLog, today: date) -> Achievements:
    """Level, streak, this week's missions and every badge (``earned_on`` is None while locked)."""
    totals = _daily_totals(log)
    days = [day.date() for day in totals.index]
    weeks = sorted({_week_start(day) for day in days})
    missions_done = sum(mission.done for week in weeks for mission in _missions(totals, week))
    xp = (
        XP_PER_WORKOUT * int(totals["workouts"].sum())
        + XP_PER_SET * int(totals["sets"].sum())
        + XP_PER_RECORD * int(totals["records"].sum())
        + XP_PER_MISSION * missions_done
    )

    workouts_so_far = totals["workouts"].cumsum()
    records_so_far = totals["records"].cumsum()
    chains = streak_chains(days)
    earned = {
        BadgeKind.FIRST_WORKOUT: _first_day_reaching(workouts_so_far, 1),
        BadgeKind.WORKOUTS_10: _first_day_reaching(workouts_so_far, 10),
        BadgeKind.WORKOUTS_50: _first_day_reaching(workouts_so_far, 50),
        BadgeKind.WORKOUTS_100: _first_day_reaching(workouts_so_far, 100),
        BadgeKind.FIRST_RECORD: _first_day_reaching(records_so_far, 1),
        BadgeKind.RECORDS_10: _first_day_reaching(records_so_far, 10),
        BadgeKind.STREAK_7: _streak_day_reaching(chains, 7),
        BadgeKind.STREAK_30: _streak_day_reaching(chains, 30),
    }
    return Achievements(
        level=level_for(xp),
        streak=training_streak(days, today),
        missions=_missions(totals, _week_start(today)),
        badges=tuple(Badge(kind=kind, earned_on=earned[kind]) for kind in BadgeKind),
    )
