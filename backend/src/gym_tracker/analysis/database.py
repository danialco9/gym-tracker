"""Load a user's training log from the database into the analysis DataFrames."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd
from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session

from gym_tracker.analysis.loader import SCHEMAS, TrainingLog
from gym_tracker.models import BodyMeasurement, Exercise, Routine, RoutineExercise, RoutineSet, Workout, WorkoutSet


def _frame(table: str, rows: Iterable[Sequence[Any]]) -> pd.DataFrame:
    """Build a table with the same columns and dtypes as the CSV loader (ids become strings)."""
    schema = SCHEMAS[table]
    raw = pd.DataFrame(list(rows), columns=list(schema), dtype=object)
    frame = pd.DataFrame(index=raw.index)
    for column, kind in schema.items():
        values = raw[column]
        if kind == "date":
            frame[column] = pd.to_datetime(values)
        elif kind == "float":
            frame[column] = pd.to_numeric(values).astype(float)
        elif kind == "bool":
            frame[column] = values.astype(bool)
        else:
            frame[column] = values.map(lambda value: None if value is None else str(value)).astype("str")
    return frame


def _rows(session: Session, statement: Select[*tuple[Any, ...]]) -> list[Sequence[Any]]:
    return [tuple(row) for row in session.execute(statement)]


def load_user_log(session: Session, user_id: int, zone: ZoneInfo) -> TrainingLog:
    """Everything the analysis needs for one user: visible exercises, routines, workouts and measurements.

    A workout's ``date`` is the calendar day of ``started_at`` in ``zone``.
    """
    exercises = select(
        Exercise.id, Exercise.name, Exercise.muscle_group, Exercise.secondary_muscles, Exercise.equipment
    ).where(or_(Exercise.user_id.is_(None), Exercise.user_id == user_id))
    routines = select(Routine.id, Routine.name, Routine.description).where(Routine.user_id == user_id)
    routine_exercises = (
        select(
            RoutineExercise.routine_id,
            RoutineExercise.exercise_id,
            RoutineExercise.position,
            RoutineSet.set_number,
            RoutineSet.target_reps,
            RoutineSet.target_weight_kg,
            RoutineSet.target_rpe,
        )
        .join(Routine)
        .outerjoin(RoutineSet)
        .where(Routine.user_id == user_id)
    )
    workouts = select(Workout.id, Workout.started_at, Workout.routine_id, Workout.notes).where(
        Workout.user_id == user_id
    )
    workout_sets = (
        select(
            WorkoutSet.workout_id,
            WorkoutSet.exercise_id,
            WorkoutSet.set_number,
            WorkoutSet.reps,
            WorkoutSet.weight_kg,
            WorkoutSet.rpe,
            WorkoutSet.is_warmup,
        )
        .join(Workout)
        .where(Workout.user_id == user_id)
    )
    measurements = select(
        BodyMeasurement.measured_on,
        BodyMeasurement.weight_kg,
        BodyMeasurement.body_fat_pct,
        BodyMeasurement.waist_cm,
        BodyMeasurement.chest_cm,
        BodyMeasurement.arm_cm,
        BodyMeasurement.thigh_cm,
        BodyMeasurement.notes,
    ).where(BodyMeasurement.user_id == user_id)

    exercise_rows = [(*row[:3], ";".join(row[3]), row[4]) for row in _rows(session, exercises)]
    workout_rows = [(row[0], row[1].astimezone(zone).date(), *row[2:]) for row in _rows(session, workouts)]
    return TrainingLog(
        exercises=_frame("exercises", exercise_rows),
        routines=_frame("routines", _rows(session, routines)),
        routine_exercises=_frame("routine_exercises", _rows(session, routine_exercises)),
        workouts=_frame("workouts", workout_rows),
        workout_sets=_frame("workout_sets", _rows(session, workout_sets)),
        body_measurements=_frame("body_measurements", _rows(session, measurements)),
    )
