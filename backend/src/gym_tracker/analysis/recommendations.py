"""Rule-based progression suggestions (double progression per planned set, with plateau deloads)."""

from __future__ import annotations

import math
from collections.abc import Callable, Collection, Sequence
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
    DELOAD_WEEK = "deload_week"
    # With a rep range: every set at its top, some set under its bottom, or all of them inside.
    RANGE_TOP = "range_top"
    BELOW_RANGE = "below_range"
    WITHIN_RANGE = "within_range"


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
    # Reps past this say little about the heavier weight a set is worth, so they count as this.
    max_estimated_reps: int = 12


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
# Muscles trained with single-joint lifts, even when the exercise lists a helper muscle.
_ISOLATION_MUSCLES: set[str] = {
    MuscleGroup.BICEPS,
    MuscleGroup.FOREARMS,
    MuscleGroup.CALVES,
    MuscleGroup.ABS,
    MuscleGroup.ADDUCTORS,
    MuscleGroup.ABDUCTORS,
}
# Catalog lifts that move one joint, or stay light, although a second muscle helps: flyes, rear
# delts, pullovers... Heavy sets of few reps suit them as badly as a curl.
SINGLE_JOINT_LIFTS: frozenset[str] = frozenset(
    {
        "pec-deck",
        "cable-crossover",
        "dumbbell-fly",
        "incline-dumbbell-fly",
        "decline-dumbbell-fly",
        "flat-cable-fly",
        "incline-cable-fly",
        "dumbbell-pullover",
        "barbell-pullover",
        "back-extension",
        "reverse-pec-deck",
        "face-pull",
        "rear-delt-fly",
        "cable-rear-delt-fly",
        "band-pull-apart",
        "upright-row",
        "dumbbell-upright-row",
        "cable-upright-row",
        "glute-kickback-machine",
        "cable-pull-through",
    }
)
_LOWER_BODY: set[str] = {MuscleGroup.QUADS, MuscleGroup.GLUTES, MuscleGroup.HAMSTRINGS}
_DOUBLED_FOR_LOWER_BODY: set[str] = {Equipment.BARBELL, Equipment.SMITH_MACHINE, Equipment.MACHINE}


def load_increment(equipment: str | None, muscle_group: str | None, rules: ProgressionRules = DEFAULT_RULES) -> float:
    """The load step for an exercise: what its equipment allows, doubled for heavy leg lifts."""
    base = _BASE_INCREMENT_KG.get(equipment or "", rules.load_increment_kg)
    if muscle_group in _LOWER_BODY and equipment in _DOUBLED_FOR_LOWER_BODY:
        return base * 2
    return base


@dataclass(frozen=True)
class RepRanges:
    """The reps a training goal asks for, inclusive: multi-joint lifts go heavier than single-joint ones."""

    compound: tuple[int, int]
    isolation: tuple[int, int]


def is_compound(muscle_group: str | None, secondary_muscles: str | None) -> bool:
    """Whether an exercise is a multi-joint lift: it works more muscles than its main one.

    Curls, calf raises and the like stay single-joint whatever helps them.
    """
    return bool(secondary_muscles) and muscle_group not in _ISOLATION_MUSCLES


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
    # The rep range the suggestion moves in, when the user's goal gives one.
    rep_range: tuple[int, int] | None = None


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


def _progress_in_range(
    *,
    weights: Sequence[float],
    done_reps: Sequence[int],
    complete: bool,
    max_rpe: float | None,
    increment: float,
    rep_range: tuple[int, int],
    rules: ProgressionRules,
) -> Progression:
    """Double progression: reps climb to the top of the range, then the weight does and they restart.

    ``complete`` says whether every planned set was done.
    """
    low, high = rep_range
    ceiling = high + rules.rep_ceiling_margin
    # The weight each set is worth at the bottom of the range, by Epley, down to the increment.
    heavier = [
        math.floor(weight * (1 + min(done, rules.max_estimated_reps) / 30) / (1 + low / 30) / increment + 1e-9)
        * increment
        for weight, done in zip(weights, done_reps, strict=True)
    ]
    new_weights, new_reps = list(weights), list(done_reps)
    if any(done < low for done in done_reps):
        action, reason = Action.INCREASE_REPS, Reason.BELOW_RANGE
        new_reps = [max(done, low) for done in done_reps]
    elif not complete:
        action, reason = Action.INCREASE_REPS, Reason.TARGETS_MISSED
    elif any(done < high for done in done_reps):
        action, reason = Action.INCREASE_REPS, Reason.WITHIN_RANGE
        new_reps = [done + 1 if done < high else done for done in done_reps]
    elif max_rpe is not None and max_rpe > rules.max_rpe_to_progress:
        action, reason = Action.HOLD, Reason.TARGETS_HIT_HARD
    elif all(new >= weight + increment for new, weight in zip(heavier, weights, strict=True)):
        action, reason = Action.INCREASE_LOAD, Reason.RANGE_TOP
        new_weights, new_reps = heavier, [low] * len(weights)
    elif any(done < ceiling for done in done_reps):
        # The smallest step is more than the reps earned (light dumbbells): a few reps over the top first.
        action, reason = Action.INCREASE_REPS, Reason.JUMP_TOO_BIG
        new_reps = [done + 1 if done < ceiling else done for done in done_reps]
    else:
        action, reason = Action.INCREASE_LOAD, Reason.RANGE_TOP
        new_weights, new_reps = [weight + increment for weight in weights], [low] * len(weights)
    return Progression(
        action,
        reason,
        tuple(PlannedSet(reps=rep, weight_kg=weight) for rep, weight in zip(new_reps, new_weights, strict=True)),
    )


def decide_progression(
    *,
    performed: Sequence[PerformedSet],
    planned: Sequence[PlannedSet],
    stalled: bool,
    increment_kg: float | None = None,
    rules: ProgressionRules = DEFAULT_RULES,
    rep_range: tuple[int, int] | None = None,
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

    With a ``rep_range`` (the one the user's goal asks for) the reps move too, as double
    progression: one more rep per set with the same weight until every set reaches the top of the
    range, and then a heavier weight that brings the reps back to its bottom (3 x 12 with 60 kg
    becomes 3 x 8 with 65 kg). A routine that plans fewer reps than the range was written heavy on
    purpose, so it keeps following its own targets.
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

    if rep_range is not None and all(target is None or target >= rep_range[0] for target in target_reps):
        return _progress_in_range(
            weights=weights,
            done_reps=done_reps,
            complete=len(performed) >= len(planned),
            max_rpe=max_rpe,
            increment=increment,
            rep_range=rep_range,
            rules=rules,
        )

    if all(target is None for target in target_reps):
        easy = max_rpe is not None and max_rpe <= rules.easy_rpe
        return (
            load_up(Reason.EASY_WITHOUT_PLAN) if easy else suggest(Action.INCREASE_REPS, Reason.WITHOUT_PLAN, weights)
        )

    targets_hit = len(performed) >= len(planned) and all(
        planned_set.reps is None or performed_set.reps >= planned_set.reps
        for planned_set, performed_set in zip(planned, performed, strict=False)
    )
    if not targets_hit:
        return suggest(Action.INCREASE_REPS, Reason.TARGETS_MISSED, weights)
    if max_rpe is None or max_rpe <= rules.max_rpe_to_progress:
        return load_up(Reason.TARGETS_HIT)
    return suggest(Action.HOLD, Reason.TARGETS_HIT_HARD, weights)


def decide_deload_week(*, performed: Sequence[PerformedSet], planned: Sequence[PlannedSet]) -> Progression:
    """The deload week of a training block: the same weights and target reps, half the sets.

    Rounded up, so a single set stays. Lighter work for a week lets fatigue clear before the next
    block; nothing the last session said about progressing applies until then.
    """
    if not performed:
        raise ValueError("At least one performed set is needed")
    weights = _next_weights(performed, planned)
    # The planned reps of each set, or what was done in it without a plan.
    last = len(performed) - 1
    reps = [
        planned[index].reps if planned and planned[index].reps is not None else performed[min(index, last)].reps
        for index in range(len(weights))
    ]
    kept = math.ceil(len(weights) / 2)
    return Progression(
        Action.HOLD,
        Reason.DELOAD_WEEK,
        tuple(PlannedSet(reps=rep, weight_kg=weight) for rep, weight in zip(reps[:kept], weights[:kept], strict=True)),
    )


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


def _without_deload_weeks(work: pd.DataFrame, in_deload: Callable[[date], bool]) -> pd.DataFrame:
    """Drop the sets done in deload weeks, except for exercises trained only then.

    A deload session is light on purpose: as "the last time" it would read as targets missed, and in
    the plateau window as a stall.
    """
    deload = work["date"].dt.date.map(in_deload).astype(bool)
    building_ids = set(work.loc[~deload, "exercise_id"])
    kept: pd.DataFrame = work.loc[~deload | ~work["exercise_id"].isin(building_ids)]
    return kept


def recommend(
    log: TrainingLog,
    rules: ProgressionRules = DEFAULT_RULES,
    today: date | None = None,
    in_deload: Callable[[date], bool] | None = None,
    *,
    rep_ranges: RepRanges | None = None,
    single_joint_ids: Collection[str] = SINGLE_JOINT_LIFTS,
) -> list[Recommendation]:
    """Suggest the next session for every exercise, based on its most recent one.

    Given ``today``, exercises last trained more than ``max_age_days`` before are left out: a lift
    dropped from the routine months ago needs no next step.

    For someone training in blocks, ``in_deload`` tells the days of the deload weeks. Those sessions
    are left out of the decision, and if ``today`` is one of them every suggestion is the deload.

    ``rep_ranges`` are the reps the user's goal asks for; each exercise progresses inside the range
    of its kind (see ``decide_progression``). Without them only the load moves.
    ``single_joint_ids`` are the exercises that take the single-joint range whatever muscles they
    list; by default the catalog's, for a log that names exercises by their slug.
    """
    work = working_sets(log)
    if work.empty:
        return []
    if in_deload is not None:
        work = _without_deload_weeks(work, in_deload)
    deload_week = today is not None and in_deload is not None and in_deload(today)

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
        rep_range = None
        if rep_ranges is not None and not deload_week:
            secondary = exercises.at[exercise_id, "secondary_muscles"] if known else None
            compound = (
                known
                and exercise_id not in single_joint_ids
                and is_compound(
                    str(exercises.at[exercise_id, "muscle_group"]), secondary if isinstance(secondary, str) else None
                )
            )
            rep_range = rep_ranges.compound if compound else rep_ranges.isolation
        progression = (
            decide_deload_week(performed=performed, planned=planned)
            if deload_week
            else decide_progression(
                performed=performed,
                planned=planned,
                stalled=exercise_id in stalled_ids,
                increment_kg=increment,
                rules=rules,
                rep_range=rep_range,
            )
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
                rep_range=rep_range,
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
