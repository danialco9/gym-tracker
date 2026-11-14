"""The week plan: the usual week, changes for single dates, and the ready-made split."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from gym_tracker.api.common import UNPROCESSABLE
from gym_tracker.api.deps import CurrentUser, SessionDep, SettingsDep, TodayDep
from gym_tracker.config import Settings
from gym_tracker.enums import PlanKind
from gym_tracker.models import Exercise, PlanChange, PlannedDay, Routine, RoutineExercise, RoutineSet, User, Workout
from gym_tracker.planning import DAYS_IN_WEEK, resolve_week, usual_day, week_start
from gym_tracker.presets import SETS, PresetRoutine, preset_week
from gym_tracker.schemas import (
    PlanChangeIn,
    PlanDayRead,
    PlanMoveIn,
    PlannedDayRead,
    PlannedRoutineRead,
    PresetWeekIn,
    UsualWeekIn,
    WeekPlanRead,
)

router = APIRouter(prefix="/plan", tags=["plan"])


def _ensure_routines_owned(session: Session, user: User, routine_ids: Iterable[int | None]) -> None:
    requested = {routine_id for routine_id in routine_ids if routine_id is not None}
    if not requested:
        return
    found = set(session.scalars(select(Routine.id).where(Routine.id.in_(requested), Routine.user_id == user.id)))
    if missing := sorted(requested - found):
        raise HTTPException(UNPROCESSABLE, detail=f"Unknown routine ids: {missing}")


def _usual_week(session: Session, user: User) -> dict[int, int | None]:
    days = session.scalars(select(PlannedDay).where(PlannedDay.user_id == user.id))
    return {day.weekday: day.routine_id for day in days}


def _usual_days(session: Session, user: User) -> list[PlannedDayRead]:
    days = session.scalars(select(PlannedDay).where(PlannedDay.user_id == user.id).order_by(PlannedDay.weekday))
    return [PlannedDayRead.model_validate(day) for day in days]


def _trained_dates(session: Session, user: User, monday: date, settings: Settings) -> set[date]:
    """The dates of the week with a workout, by the local day it started on."""
    zone = settings.zone
    begin = datetime.combine(monday, time(), zone)
    end = datetime.combine(monday + timedelta(days=DAYS_IN_WEEK), time(), zone)
    started = session.scalars(
        select(Workout.started_at).where(
            Workout.user_id == user.id, Workout.started_at >= begin, Workout.started_at < end
        )
    )
    return {moment.astimezone(zone).date() for moment in started}


def _week(session: Session, user: User, day: date, today: date, settings: Settings) -> WeekPlanRead:
    monday = week_start(day)
    changes = {
        change.on_date: (PlanKind(change.kind), change.routine_id)
        for change in session.scalars(
            select(PlanChange).where(
                PlanChange.user_id == user.id,
                PlanChange.on_date >= monday,
                PlanChange.on_date < monday + timedelta(days=DAYS_IN_WEEK),
            )
        )
    }
    days = resolve_week(monday, _usual_week(session, user), changes)
    routine_ids = {day.routine_id for day in days if day.routine_id is not None}
    routines = {
        routine_id: PlannedRoutineRead(id=routine_id, name=name, exercise_count=count)
        for routine_id, name, count in session.execute(
            select(Routine.id, Routine.name, func.count(RoutineExercise.id))
            .outerjoin(RoutineExercise)
            .where(Routine.id.in_(routine_ids), Routine.user_id == user.id)
            .group_by(Routine.id)
        )
    }
    trained = _trained_dates(session, user, monday, settings)
    return WeekPlanRead(
        start=monday,
        today=today,
        days=[
            PlanDayRead(
                on_date=day.on_date,
                kind=day.kind,
                routine=None if day.routine_id is None else routines.get(day.routine_id),
                changed=day.changed,
                trained=day.on_date in trained,
            )
            for day in days
        ],
    )


def _set_change(session: Session, user: User, on_date: date, kind: PlanKind, routine_id: int | None) -> None:
    change = session.scalar(select(PlanChange).where(PlanChange.user_id == user.id, PlanChange.on_date == on_date))
    if change is None:
        session.add(PlanChange(user_id=user.id, on_date=on_date, kind=kind, routine_id=routine_id))
    else:
        change.kind, change.routine_id = kind, routine_id


def _what_date_holds(session: Session, user: User, on_date: date) -> tuple[PlanKind, int | None]:
    change = session.scalar(select(PlanChange).where(PlanChange.user_id == user.id, PlanChange.on_date == on_date))
    if change is not None:
        return PlanKind(change.kind), change.routine_id
    return usual_day(on_date.weekday(), _usual_week(session, user))


@router.get("/week")
def read_week(
    session: SessionDep, user: CurrentUser, today: TodayDep, settings: SettingsDep, start: date | None = None
) -> WeekPlanRead:
    """The week of ``start`` (any of its days), or the current one."""
    return _week(session, user, start or today, today, settings)


@router.get("/days")
def read_usual_week(session: SessionDep, user: CurrentUser) -> list[PlannedDayRead]:
    return _usual_days(session, user)


@router.put("/days")
def replace_usual_week(payload: UsualWeekIn, session: SessionDep, user: CurrentUser) -> list[PlannedDayRead]:
    """Replace the whole usual week. Changes made for single dates stay."""
    _ensure_routines_owned(session, user, (day.routine_id for day in payload.days))
    session.execute(delete(PlannedDay).where(PlannedDay.user_id == user.id))
    session.add_all(PlannedDay(user_id=user.id, weekday=day.weekday, routine_id=day.routine_id) for day in payload.days)
    session.commit()
    return _usual_days(session, user)


@router.put("/changes/{on_date}")
def change_day(
    on_date: date,
    payload: PlanChangeIn,
    *,
    session: SessionDep,
    user: CurrentUser,
    today: TodayDep,
    settings: SettingsDep,
) -> WeekPlanRead:
    """What one date holds instead of the usual week."""
    _ensure_routines_owned(session, user, [payload.routine_id])
    _set_change(session, user, on_date, PlanKind(payload.kind), payload.routine_id)
    session.commit()
    return _week(session, user, on_date, today, settings)


@router.delete("/changes/{on_date}")
def undo_change(
    on_date: date, session: SessionDep, user: CurrentUser, today: TodayDep, settings: SettingsDep
) -> WeekPlanRead:
    """Back to what the usual week holds on that date."""
    session.execute(delete(PlanChange).where(PlanChange.user_id == user.id, PlanChange.on_date == on_date))
    session.commit()
    return _week(session, user, on_date, today, settings)


@router.post("/move")
def move_day(
    payload: PlanMoveIn, session: SessionDep, user: CurrentUser, today: TodayDep, settings: SettingsDep
) -> WeekPlanRead:
    """Move what one date holds to another, which it replaces; the first date becomes a rest day."""
    kind, routine_id = _what_date_holds(session, user, payload.from_date)
    if kind == PlanKind.REST:
        raise HTTPException(UNPROCESSABLE, detail="Nothing is planned on that date")
    _set_change(session, user, payload.to_date, kind, routine_id)
    _set_change(session, user, payload.from_date, PlanKind.REST, None)
    session.commit()
    return _week(session, user, payload.from_date, today, settings)


def _preset_routine(session: Session, user: User, preset: PresetRoutine, catalog_ids: dict[str, int]) -> Routine:
    """The user's copy of a ready-made routine: an existing one by the same name is reused as it is."""
    existing = session.scalar(select(Routine).where(Routine.user_id == user.id, Routine.name == preset.name))
    if existing is not None:
        return existing
    routine = Routine(
        user_id=user.id,
        name=preset.name,
        description=preset.description,
        exercises=[
            RoutineExercise(
                position=position,
                exercise_id=catalog_ids[item.slug],
                sets=[RoutineSet(set_number=number, target_reps=item.reps) for number in range(1, SETS + 1)],
            )
            for position, item in enumerate(preset.exercises, start=1)
        ],
    )
    session.add(routine)
    return routine


@router.post("/presets", status_code=status.HTTP_201_CREATED)
def apply_presets(payload: PresetWeekIn, session: SessionDep, user: CurrentUser) -> list[PlannedDayRead]:
    """Copy the ready-made split for those days to the user's routines and make it the usual week."""
    week = preset_week(payload.weekdays)
    slugs = {item.slug for _, preset in week for item in preset.exercises}
    catalog_ids = dict(
        session.execute(select(Exercise.slug, Exercise.id).where(Exercise.slug.in_(slugs), Exercise.user_id.is_(None)))
        .tuples()
        .all()
    )
    if missing := sorted(slugs - set(catalog_ids)):
        # Only if the catalog was not seeded; every preset slug is in CATALOG.
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Catalog exercises missing: {missing}")
    routines = {preset.name: _preset_routine(session, user, preset, catalog_ids) for _, preset in week}
    session.flush()
    session.execute(delete(PlannedDay).where(PlannedDay.user_id == user.id))
    session.add_all(
        PlannedDay(user_id=user.id, weekday=weekday, routine_id=routines[preset.name].id) for weekday, preset in week
    )
    session.commit()
    return _usual_days(session, user)
