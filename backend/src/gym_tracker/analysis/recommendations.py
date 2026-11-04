"""Rule-based progression suggestions (double progression per planned set, with plateau deloads)."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum
from typing import Any

import pandas as pd

from gym_tracker.analysis.loader import TrainingLog
from gym_tracker.analysis.metrics import detect_plateaus, session_bests, working_sets
from gym_tracker.enums import Equipment, MuscleGroup


class VolumeStatus(StrEnum):
    LOW = "low"
    HIGH = "high"


class Action(StrEnum):
    INCREASE_LOAD = "increase_load"
    INCREASE_REPS = "increase_reps"
    HOLD = "hold"
    DELOAD = "deload"


class Reason(StrEnum):
    """Why an action was chosen, for the app to explain it in its own words."""

    PLATEAU = "plateau"
    TARGETS_HIT = "targets_hit"
    TARGETS_HIT_HARD = "targets_hit_hard"
    TARGETS_MISSED = "targets_missed"
    EASY_WITHOUT_PLAN = "easy_without_plan"
    WITHOUT_PLAN = "without_plan"
    JUMP_TOO_BIG = "jump_too_big"


@dataclass(frozen=True)
class ProgressionRules:
    load_increment_kg: float = 2.5
    max_rpe_to_progress: float = 8.0
    easy_rpe: float = 7.0
    deload_factor: float = 0.9
    plateau_window: int = 3
    # A jump above this share of the working weight is too big to take at once: reps go first.
    max_relative_jump: float = 0.10
    # Reps over the target on every set that earn the jump anyway (10 -> 12, then more weight).
    rep_ceiling_margin: int = 2
    # The same ceiling for sets without target reps.
    rep_ceiling_without_plan: int = 15
    # Exercises not trained for longer than this are left out of the suggestions.
    max_age_days: int = 28


DEFAULT_RULES = ProgressionRules()

# The smallest load step each kind of equipment usually allows (dumbbells go up per hand).
_BASE_INCREMENT_KG: dict[str, float] = {
    Equipment.BARBELL: 2.5,
    Equipment.EZ_BAR: 2.5,
    Equipment.SMITH_MACHINE: 2.5,
    Equipment.DUMBBELL: 2.0,
    Equipment.KETTLEBELL: 4.0,
    Equipment.MACHINE: 2.5,
    Equipment.CABLE: 2.5,
    Equipment.BODYWEIGHT: 2.5,
    Equipment.BAND: 2.5,
}
_LOWER_BODY: set[str] = {MuscleGroup.QUADS, MuscleGroup.GLUTES, MuscleGroup.HAMSTRINGS}
_DOUBLED_FOR_LOWER_BODY: set[str] = {Equipment.BARBELL, Equipment.SMITH_MACHINE, Equipment.MACHINE}


def load_increment(equipment: str | None, muscle_group: str | None, rules: ProgressionRules = DEFAULT_RULES) -> float:
    """The load step for an exercise: what its equipment allows, doubled for heavy leg lifts."""
    base = _BASE_INCREMENT_KG.get(equipment or "", rules.load_increment_kg)
    if muscle_group in _LOWER_BODY and equipment in _DOUBLED_FOR_LOWER_BODY:
        return base * 2
    return base


@dataclass(frozen=True)
class PerformedSet:
    reps: int
    weight_kg: float
    rpe: float | None = None


@dataclass(frozen=True)
class PlannedSet:
    reps: int | None = None
    weight_kg: float | None = None


@dataclass(frozen=True)
class Progression:
    action: Action
    reason: Reason
    suggested_sets: tuple[PlannedSet, ...]


@dataclass(frozen=True)
class Recommendation:
    exercise_id: str
    exercise_name: str
    action: Action
    reason: Reason
    increment_kg: float
    last_performed_on: date
    last_sets: tuple[PerformedSet, ...]
    target_sets: tuple[PlannedSet, ...]
    suggested_sets: tuple[PlannedSet, ...]


def _next_weights(performed: Sequence[PerformedSet], planned: Sequence[PlannedSet]) -> list[float]:
    """Start from what was lifted in each set; sets that were not done fall back to the plan."""
    count = len(planned) or len(performed)
    weights = []
    for index in range(count):
        if index < len(performed):
            weights.append(performed[index].weight_kg)
        else:
            planned_weight = planned[index].weight_kg
            weights.append(planned_weight if planned_weight is not None else performed[-1].weight_kg)
    return weights


def decide_progression(
    *,
    performed: Sequence[PerformedSet],
    planned: Sequence[PlannedSet],
    stalled: bool,
    increment_kg: float | None = None,
    rules: ProgressionRules = DEFAULT_RULES,
) -> Progression:
    """Choose the next step for one exercise from its working sets in the last session.

    Sets are compared in order with the routine's planned sets, so ramping the weight or the
    reps from set to set is supported. The suggestion keeps that shape and moves every set:

    - Stalled: deload ``deload_factor`` of each weight, rounded down to the increment.
    - Every planned set done with at least its target reps and RPE <= ``max_rpe_to_progress``:
      add ``increment_kg`` to every set.
    - Targets hit but the effort was too high: repeat the same weights.
    - Targets missed: keep the weights and work towards the target reps.
    - Without target reps, add load only when the effort was easy.

    When adding load would be a jump above ``max_relative_jump`` of the working weight (2 kg on a
    6 kg dumbbell), one more rep per set comes first, until every set is ``rep_ceiling_margin``
    reps over its target; then the jump is earned.
    """
    if not performed:
        raise ValueError("At least one performed set is needed")
    increment = rules.load_increment_kg if increment_kg is None else increment_kg
    weights = _next_weights(performed, planned)
    target_reps = [planned[index].reps if planned else None for index in range(len(weights))]
    # What was actually done in each set; a set that was skipped counts as its last done one.
    done_reps = [performed[min(index, len(performed) - 1)].reps for index in range(len(weights))]
    reps = [target if target is not None else done for target, done in zip(target_reps, done_reps, strict=True)]
    rpes = [performed_set.rpe for performed_set in performed if performed_set.rpe is not None]
    max_rpe = max(rpes) if rpes else None

    def suggest(
        action: Action, reason: Reason, new_weights: Sequence[float], new_reps: Sequence[int] = reps
    ) -> Progression:
        return Progression(
            action,
            reason,
            tuple(PlannedSet(reps=rep, weight_kg=weight) for rep, weight in zip(new_reps, new_weights, strict=True)),
        )

    def load_up(reason: Reason) -> Progression:
        if increment > rules.max_relative_jump * max(weights):
            ceilings = [
                target + rules.rep_ceiling_margin if target is not None else rules.rep_ceiling_without_plan
                for target in target_reps
            ]
            if not all(done >= ceiling for done, ceiling in zip(done_reps, ceilings, strict=True)):
                # A set already at its ceiling keeps what was done; the rest add one rep.
                more_reps = [
                    done if done >= ceiling else done + 1 for done, ceiling in zip(done_reps, ceilings, strict=True)
                ]
                return suggest(Action.INCREASE_REPS, Reason.JUMP_TOO_BIG, weights, more_reps)
        return suggest(Action.INCREASE_LOAD, reason, [weight + increment for weight in weights])

    if stalled:
        return suggest(
            Action.DELOAD,
            Reason.PLATEAU,
            [max(0.0, math.floor(weight * rules.deload_factor / increment) * increment) for weight in weights],
        )

    if all(target is None for target in target_reps):
        if max_rpe is not None and max_rpe <= rules.easy_rpe:
            return load_up(Reason.EASY_WITHOUT_PLAN)
        return suggest(Action.INCREASE_REPS, Reason.WITHOUT_PLAN, weights)

    targets_hit = len(performed) >= len(planned) and all(
        planned_set.reps is None or performed_set.reps >= planned_set.reps
        for planned_set, performed_set in zip(planned, performed, strict=False)
    )
    if not targets_hit:
        return suggest(Action.INCREASE_REPS, Reason.TARGETS_MISSED, weights)
    if max_rpe is None or max_rpe <= rules.max_rpe_to_progress:
        return load_up(Reason.TARGETS_HIT)
    return suggest(Action.HOLD, Reason.TARGETS_HIT_HARD, weights)


def _optional_int(value: Any) -> int | None:
    return None if pd.isna(value) else int(value)


def _optional_float(value: Any) -> float | None:
    return None if pd.isna(value) else float(value)


def _planned_sets(log: TrainingLog) -> dict[tuple[str, str], tuple[PlannedSet, ...]]:
    """Planned sets per (routine, exercise); an exercise listed twice in a routine uses its first slot."""
    rows = log.routine_exercises.dropna(subset=["set_number"]).sort_values(["position", "set_number"])
    plans: dict[tuple[str, str], tuple[PlannedSet, ...]] = {}
    for (routine_id, exercise_id), slot_sets in rows.groupby(["routine_id", "exercise_id"], sort=False):
        first_slot = slot_sets[slot_sets["position"] == slot_sets["position"].iloc[0]]
        plans[(str(routine_id), str(exercise_id))] = tuple(
            PlannedSet(
                reps=_optional_int(row["target_reps"]),
                weight_kg=_optional_float(row["target_weight_kg"]),
            )
            for row in first_slot.to_dict(orient="records")
        )
    return plans


def recommend(
    log: TrainingLog, rules: ProgressionRules = DEFAULT_RULES, today: date | None = None
) -> list[Recommendation]:
    """Suggest the next session for every exercise, based on its most recent one.

    Given ``today``, exercises last trained more than ``max_age_days`` before are left out: a lift
    dropped from the routine months ago needs no next step.
    """
    work = working_sets(log)
    if work.empty:
        return []

    plateaus = detect_plateaus(session_bests(work), window=rules.plateau_window)
    stalled_ids = set(plateaus.loc[plateaus["stalled"].astype(bool), "exercise_id"])
    exercises = log.exercises.set_index("exercise_id")
    plans = _planned_sets(log)
    oldest = None if today is None else today - timedelta(days=rules.max_age_days)

    recommendations = []
    for group_key, exercise_sets in work.groupby("exercise_id", sort=True):
        exercise_id = str(group_key)
        last_session = exercise_sets[exercise_sets["workout_id"] == exercise_sets["workout_id"].iloc[-1]]
        last_performed_on = last_session["date"].iloc[0].date()
        if oldest is not None and last_performed_on < oldest:
            continue
        performed = tuple(
            PerformedSet(
                reps=int(row["reps"]),
                weight_kg=float(row["weight_kg"]),
                rpe=_optional_float(row["rpe"]),
            )
            for row in last_session.to_dict(orient="records")
        )
        planned = plans.get((str(last_session["routine_id"].iloc[0]), exercise_id), ())
        known = exercise_id in exercises.index
        increment = load_increment(
            str(exercises.at[exercise_id, "equipment"]) if known else None,
            str(exercises.at[exercise_id, "muscle_group"]) if known else None,
            rules,
        )
        progression = decide_progression(
            performed=performed,
            planned=planned,
            stalled=exercise_id in stalled_ids,
            increment_kg=increment,
            rules=rules,
        )
        recommendations.append(
            Recommendation(
                exercise_id=exercise_id,
                exercise_name=str(exercises.at[exercise_id, "name"]) if known else exercise_id,
                action=progression.action,
                reason=progression.reason,
                increment_kg=increment,
                last_performed_on=last_performed_on,
                last_sets=performed,
                target_sets=planned,
                suggested_sets=progression.suggested_sets,
            )
        )
    return recommendations


@dataclass(frozen=True)
class VolumeRules:
    """Weekly hard sets per muscle. Around 10-20 is the range most hypertrophy studies support:
    fewer leaves growth on the table, more mostly adds fatigue."""

    min_hard_sets: int = 10
    max_hard_sets: int = 20
    # A set counts in full for the exercise's main muscle and this much for each secondary one.
    secondary_share: float = 0.5
    # Complete weeks averaged (the current, unfinished one never counts).
    weeks: int = 4
    # Weeks of history needed before judging at all.
    min_weeks: int = 2


DEFAULT_VOLUME_RULES = VolumeRules()

# The muscles a routine is built around. Smaller ones (calves, forearms, abs...) are trained on
# purpose in very different amounts, so a fixed range would mostly produce noise for them.
MAIN_MUSCLES: tuple[str, ...] = (
    MuscleGroup.CHEST,
    MuscleGroup.BACK,
    MuscleGroup.SHOULDERS,
    MuscleGroup.BICEPS,
    MuscleGroup.TRICEPS,
    MuscleGroup.QUADS,
    MuscleGroup.HAMSTRINGS,
    MuscleGroup.GLUTES,
)


@dataclass(frozen=True)
class VolumeAdvice:
    muscle_group: str
    average_hard_sets: float
    status: VolumeStatus
    weeks: int


def _muscle_shares(exercises: pd.DataFrame, secondary_share: float) -> pd.DataFrame:
    """How much one set of each exercise counts for each muscle it trains."""
    rows = []
    for exercise in exercises.to_dict(orient="records"):
        rows.append((exercise["exercise_id"], exercise["muscle_group"], 1.0))
        secondary = exercise["secondary_muscles"] if isinstance(exercise["secondary_muscles"], str) else ""
        rows.extend((exercise["exercise_id"], muscle, secondary_share) for muscle in secondary.split(";") if muscle)
    return pd.DataFrame(rows, columns=["exercise_id", "muscle_group", "share"])


def _sets_per_muscle(work: pd.DataFrame, exercises: pd.DataFrame, secondary_share: float) -> pd.Series:
    """Hard sets per muscle, a set counting in full for its main muscle and ``secondary_share`` for each
    secondary one."""
    shares = _muscle_shares(exercises, secondary_share)
    totals: pd.Series = work[["exercise_id"]].merge(shares, on="exercise_id").groupby("muscle_group")["share"].sum()
    return totals


def _week_starts(work: pd.DataFrame) -> pd.Series:
    """The Monday of each set's week."""
    starts: pd.Series = (work["date"] - pd.to_timedelta(work["date"].dt.weekday, unit="D")).dt.date
    return starts


def volume_advice(log: TrainingLog, today: date, rules: VolumeRules = DEFAULT_VOLUME_RULES) -> list[VolumeAdvice]:
    """Main muscles whose average weekly hard sets fall outside the recommended range.

    A set counts in full for the exercise's main muscle and ``secondary_share`` for each secondary
    one: a squat is a quads exercise, but a leg day of squats is not zero sets for the glutes.
    Only complete weeks since training started count, so a first week, or the current one half
    done, never reads as too little.
    """
    work = working_sets(log)
    if work.empty:
        return []
    current_week = today - timedelta(days=today.weekday())
    first_date = work["date"].min().date()
    first_week = first_date - timedelta(days=first_date.weekday())
    weeks = [
        week
        for week in (current_week - timedelta(weeks=offset) for offset in range(1, rules.weeks + 1))
        if week >= first_week
    ]
    if len(weeks) < rules.min_weeks:
        return []

    totals = _sets_per_muscle(work.loc[_week_starts(work).isin(weeks)], log.exercises, rules.secondary_share)

    advice = []
    for muscle in MAIN_MUSCLES:
        average = float(totals.get(muscle, 0)) / len(weeks)
        if average < rules.min_hard_sets:
            status = VolumeStatus.LOW
        elif average > rules.max_hard_sets:
            status = VolumeStatus.HIGH
        else:
            continue
        advice.append(VolumeAdvice(str(muscle), round(average, 1), status, len(weeks)))
    return advice


@dataclass(frozen=True)
class MuscleWeekSets:
    muscle_group: str
    hard_sets: float


def current_week_sets(log: TrainingLog, today: date, rules: VolumeRules = DEFAULT_VOLUME_RULES) -> list[MuscleWeekSets]:
    """Hard sets of each main muscle so far this week (from Monday), counted as ``volume_advice`` does.

    Unlike the advice, it judges nothing: it is the live count the week's target is filled with.
    """
    work = working_sets(log)
    current_week = today - timedelta(days=today.weekday())
    totals = (
        _sets_per_muscle(work.loc[_week_starts(work) == current_week], log.exercises, rules.secondary_share)
        if not work.empty
        else pd.Series(dtype=float)
    )
    return [MuscleWeekSets(str(muscle), round(float(totals.get(muscle, 0)), 1)) for muscle in MAIN_MUSCLES]
