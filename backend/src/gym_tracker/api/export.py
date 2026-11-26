"""The user's own data as CSV files, laid out for a spreadsheet set to Spanish.

Excel in Spanish splits columns on ``;`` and reads ``37,5`` as a number, so the files use both.
They start with a UTF-8 byte order mark, without which Excel shows accents as garbage.
"""

from __future__ import annotations

import csv
import io
from collections.abc import Iterable, Sequence
from decimal import Decimal

from fastapi import APIRouter, Response
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from gym_tracker.api.deps import CurrentUser, SessionDep, SettingsDep, TodayDep
from gym_tracker.models import BodyMeasurement, Routine, Workout, WorkoutSet

router = APIRouter(prefix="/export", tags=["export"])

WORKOUT_HEADER = ("fecha", "hora", "rutina", "ejercicio", "serie", "calentamiento", "kg", "reps", "rir", "notas")
MEASUREMENT_HEADER = ("fecha", "peso_kg", "grasa_pct", "cintura_cm", "pecho_cm", "brazo_cm", "muslo_cm", "notas")

# A cell starting with one of these runs as a formula in a spreadsheet: a quote in front keeps it text.
FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")


def spanish_number(value: Decimal | None) -> str:
    """``37,5`` for 37.50 and ``20`` for 20.00; empty for no value."""
    if value is None:
        return ""
    text = format(value.normalize(), "f")
    return text.replace(".", ",")


def safe_text(value: str | None) -> str:
    """Free text as a cell that cannot run as a formula."""
    if not value:
        return ""
    return f"'{value}" if value.startswith(FORMULA_STARTS) else value


def csv_response(header: Sequence[str], rows: Iterable[Sequence[str]], filename: str) -> Response:
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    writer.writerow(header)
    writer.writerows(rows)
    return Response(
        content="﻿" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/workouts.csv")
def export_workouts(session: SessionDep, user: CurrentUser, settings: SettingsDep, today: TodayDep) -> Response:
    """One row per set, oldest workout first; the workout's notes go on its first row."""
    workouts = session.scalars(
        select(Workout)
        .where(Workout.user_id == user.id)
        .options(selectinload(Workout.sets).selectinload(WorkoutSet.exercise))
        .order_by(Workout.started_at, Workout.id)
    ).all()
    routine_names = dict(session.execute(select(Routine.id, Routine.name).where(Routine.user_id == user.id)).all())

    rows: list[tuple[str, ...]] = []
    for workout in workouts:
        started = workout.started_at.astimezone(settings.zone)
        routine = routine_names.get(workout.routine_id, "") if workout.routine_id is not None else ""
        for index, workout_set in enumerate(workout.sets):
            rows.append(
                (
                    started.date().isoformat(),
                    started.strftime("%H:%M"),
                    safe_text(routine),
                    safe_text(workout_set.exercise.name),
                    str(workout_set.set_number),
                    "sí" if workout_set.is_warmup else "no",
                    spanish_number(workout_set.weight_kg),
                    str(workout_set.reps),
                    spanish_number(None if workout_set.rpe is None else 10 - workout_set.rpe),
                    safe_text(workout.notes) if index == 0 else "",
                )
            )
    return csv_response(WORKOUT_HEADER, rows, f"entrenos-{today.isoformat()}.csv")


@router.get("/measurements.csv")
def export_measurements(session: SessionDep, user: CurrentUser, today: TodayDep) -> Response:
    measurements = session.scalars(
        select(BodyMeasurement).where(BodyMeasurement.user_id == user.id).order_by(BodyMeasurement.measured_on)
    )
    rows = [
        (
            measurement.measured_on.isoformat(),
            spanish_number(measurement.weight_kg),
            spanish_number(measurement.body_fat_pct),
            spanish_number(measurement.waist_cm),
            spanish_number(measurement.chest_cm),
            spanish_number(measurement.arm_cm),
            spanish_number(measurement.thigh_cm),
            safe_text(measurement.notes),
        )
        for measurement in measurements
    ]
    return csv_response(MEASUREMENT_HEADER, rows, f"medidas-{today.isoformat()}.csv")
