"""Routine templates with ordered exercises and their planned sets."""

from __future__ import annotations

from fastapi import APIRouter, status
from sqlalchemy import Select, select
from sqlalchemy.orm import Session, selectinload

from gym_tracker.api.common import commit_or_conflict, ensure_exercises_visible, not_found
from gym_tracker.api.deps import CurrentUser, SessionDep
from gym_tracker.models import Routine, RoutineExercise, RoutineSet, User
from gym_tracker.schemas import RoutineIn, RoutineRead

router = APIRouter(prefix="/routines", tags=["routines"])

DUPLICATE_NAME = "A routine with this name already exists"


def _routines(user: User) -> Select[Routine]:
    return (
        select(Routine)
        .where(Routine.user_id == user.id)
        .options(
            selectinload(Routine.exercises).selectinload(RoutineExercise.exercise),
            selectinload(Routine.exercises).selectinload(RoutineExercise.sets),
        )
    )


def _get_routine(session: Session, routine_id: int, user: User) -> Routine:
    routine = session.scalar(_routines(user).where(Routine.id == routine_id))
    if routine is None:
        raise not_found("Routine")
    return routine


def _routine_exercises(payload: RoutineIn) -> list[RoutineExercise]:
    last = len(payload.exercises)
    return [
        RoutineExercise(
            position=position,
            exercise_id=item.exercise_id,
            # The last exercise has nothing after it to pair with.
            superset_with_next=item.superset_with_next and position < last,
            sets=[
                RoutineSet(set_number=set_number, **planned.model_dump())
                for set_number, planned in enumerate(item.sets, start=1)
            ],
        )
        for position, item in enumerate(payload.exercises, start=1)
    ]


@router.get("")
def list_routines(session: SessionDep, user: CurrentUser) -> list[RoutineRead]:
    routines = session.scalars(_routines(user).order_by(Routine.name))
    return [RoutineRead.model_validate(routine) for routine in routines]


@router.get("/{routine_id}")
def read_routine(routine_id: int, session: SessionDep, user: CurrentUser) -> RoutineRead:
    return RoutineRead.model_validate(_get_routine(session, routine_id, user))


@router.post("", status_code=status.HTTP_201_CREATED)
def create_routine(payload: RoutineIn, session: SessionDep, user: CurrentUser) -> RoutineRead:
    ensure_exercises_visible(session, user, (item.exercise_id for item in payload.exercises))
    routine = Routine(
        user_id=user.id,
        name=payload.name,
        description=payload.description,
        exercises=_routine_exercises(payload),
    )
    session.add(routine)
    commit_or_conflict(session, DUPLICATE_NAME)
    return RoutineRead.model_validate(_get_routine(session, routine.id, user))


@router.put("/{routine_id}")
def replace_routine(routine_id: int, payload: RoutineIn, session: SessionDep, user: CurrentUser) -> RoutineRead:
    routine = _get_routine(session, routine_id, user)
    ensure_exercises_visible(session, user, (item.exercise_id for item in payload.exercises))
    # Delete the old slots first: positions are unique per routine.
    routine.exercises.clear()
    session.flush()
    routine.name = payload.name
    routine.description = payload.description
    routine.exercises.extend(_routine_exercises(payload))
    commit_or_conflict(session, DUPLICATE_NAME)
    return RoutineRead.model_validate(_get_routine(session, routine.id, user))


@router.delete("/{routine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_routine(routine_id: int, session: SessionDep, user: CurrentUser) -> None:
    session.delete(_get_routine(session, routine_id, user))
    session.commit()
