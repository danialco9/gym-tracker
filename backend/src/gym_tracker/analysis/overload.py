"""Progressive overload this week: did each exercise beat the time before?"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum

from gym_tracker.analysis.loader import TrainingLog
from gym_tracker.analysis.metrics import working_sets


class OverloadVerdict(StrEnum):
    BEATEN = "beaten"
    MATCHED = "matched"
    BELOW = "below"


@dataclass(frozen=True)
class SetLoad:
    weight_kg: float
    reps: int


@dataclass(frozen=True)
class ExerciseOverload:
    exercise_id: str
    exercise_name: str
    verdict: OverloadVerdict
    #: The set of this week's session that tells the verdict, and the same set the time before.
    current: SetLoad
    previous: SetLoad


_ORDER = {OverloadVerdict.BEATEN: 0, OverloadVerdict.MATCHED: 1, OverloadVerdict.BELOW: 2}


def compare_set(current: SetLoad, previous: SetLoad) -> OverloadVerdict:
    """More weight, or more reps with the same weight, beats the set; the app's workout screen agrees."""
    if current.weight_kg > previous.weight_kg or (
        current.weight_kg == previous.weight_kg and current.reps > previous.reps
    ):
        return OverloadVerdict.BEATEN
    if current == previous:
        return OverloadVerdict.MATCHED
    return OverloadVerdict.BELOW


def week_overload(log: TrainingLog, today: date) -> list[ExerciseOverload]:
    """Each exercise trained this week (from Monday), against the session of it before.

    The latest session this week is compared set by set, in order and without warm-ups, with the one
    before it: one set beaten is enough, as during the workout. Exercises done for the first time
    have nothing to beat yet and are left out. Beaten first, then matched, then below.
    """
    work = working_sets(log)
    if work.empty:
        return []
    current_week = today - timedelta(days=today.weekday())
    names = log.exercises.set_index("exercise_id")["name"]

    results = []
    for group_key, exercise_sets in work.groupby("exercise_id", sort=True):
        exercise_id = str(group_key)
        *earlier, last_id = dict.fromkeys(exercise_sets["workout_id"])
        if not earlier:
            continue
        latest = exercise_sets[exercise_sets["workout_id"] == last_id]
        if latest["date"].iloc[0].date() < current_week:
            continue
        before = exercise_sets[exercise_sets["workout_id"] == earlier[-1]]
        pairs = [
            (SetLoad(float(now.weight_kg), int(now.reps)), SetLoad(float(then.weight_kg), int(then.reps)))
            for now, then in zip(latest.itertuples(), before.itertuples(), strict=False)
        ]
        verdicts = [compare_set(now, then) for now, then in pairs]
        if OverloadVerdict.BEATEN in verdicts:
            verdict = OverloadVerdict.BEATEN
        elif all(item is OverloadVerdict.MATCHED for item in verdicts):
            verdict = OverloadVerdict.MATCHED
        else:
            verdict = OverloadVerdict.BELOW
        # The first set that shows it: the one beaten, or the one that fell short.
        current, previous = pairs[verdicts.index(verdict)]
        results.append(
            ExerciseOverload(
                exercise_id=exercise_id,
                exercise_name=str(names.get(exercise_id, exercise_id)),
                verdict=verdict,
                current=current,
                previous=previous,
            )
        )
    return sorted(results, key=lambda item: (_ORDER[item.verdict], item.exercise_name))
