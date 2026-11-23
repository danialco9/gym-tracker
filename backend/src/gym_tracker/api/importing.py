"""Workouts brought in from a CSV: Strong, Hevy or this app's own export.

Two steps over the same file, nothing kept in between: ``preview`` says what it found and which
exercise names need a hand, and the plain ``POST`` saves it with the user's choices for those.
A workout that starts in the same minute as one already in the account is left out, so importing
the same file twice, or this app's export into the same account, adds nothing.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from gym_tracker.api.common import UNPROCESSABLE, ensure_exercises_visible, visible_to
from gym_tracker.api.deps import CurrentUser, SessionDep, SettingsDep
from gym_tracker.importing import (
    MAX_SETS_PER_EXERCISE,
    CatalogEntry,
    CsvImportError,
    ImportedWorkout,
    NameMatch,
    ParsedFile,
    match_name,
    parse_workouts,
)
from gym_tracker.models import Exercise, User, Workout, WorkoutSet
from gym_tracker.schemas import (
    DictationSuggestion,
    ImportExerciseRead,
    WorkoutImportIn,
    WorkoutImportPreview,
    WorkoutImportResult,
)

router = APIRouter(prefix="/import", tags=["import"])


def _parse(payload: WorkoutImportIn, settings: SettingsDep) -> ParsedFile:
    try:
        return parse_workouts(payload.content, settings.zone)
    except CsvImportError as error:
        raise HTTPException(UNPROCESSABLE, detail=str(error)) from error


def _minute(moment: datetime) -> datetime:
    return moment.astimezone(UTC).replace(second=0, microsecond=0)


def _split_new(session: Session, user: User, workouts: Sequence[ImportedWorkout]) -> tuple[list[ImportedWorkout], int]:
    """The workouts to add, and how many are already in the account (or twice in the file)."""
    taken = {
        _minute(started) for started in session.scalars(select(Workout.started_at).where(Workout.user_id == user.id))
    }
    new = []
    for workout in workouts:
        if not workout.sets or _minute(workout.started_at) in taken:
            continue
        taken.add(_minute(workout.started_at))
        new.append(workout)
    with_sets = sum(1 for workout in workouts if workout.sets)
    return new, with_sets - len(new)


def _matches(session: Session, user: User, workouts: Sequence[ImportedWorkout]) -> dict[str, NameMatch]:
    """Each exercise name in the workouts, in order of first appearance, with its match."""
    # The user's own exercises go first, so a custom one wins a tie on the name.
    entries = [
        CatalogEntry(exercise.id, exercise.name, exercise.slug, exercise.equipment)
        for exercise in session.scalars(
            select(Exercise).where(visible_to(user)).order_by(Exercise.user_id.is_(None), Exercise.name, Exercise.id)
        )
    ]
    names = dict.fromkeys(item.exercise for workout in workouts for item in workout.sets)
    return {name: match_name(name, entries) for name in names}


@router.post("/workouts/preview")
def preview_workouts(
    payload: WorkoutImportIn, session: SessionDep, user: CurrentUser, settings: SettingsDep
) -> WorkoutImportPreview:
    """What the file holds and which exercise names it could not match. Nothing is saved."""
    parsed = _parse(payload, settings)
    new, duplicates = _split_new(session, user, parsed.workouts)
    set_counts: dict[str, int] = {}
    for workout in new:
        for item in workout.sets:
            set_counts[item.exercise] = set_counts.get(item.exercise, 0) + 1
    matches = _matches(session, user, new)
    return WorkoutImportPreview(
        source=parsed.source.value,
        workouts=len(new),
        sets=sum(set_counts.values()),
        duplicates=duplicates,
        skipped_rows=parsed.skipped_rows,
        first_date=new[0].started_at.astimezone(settings.zone).date() if new else None,
        last_date=new[-1].started_at.astimezone(settings.zone).date() if new else None,
        exercises=[
            ImportExerciseRead(
                name=name,
                sets=set_counts[name],
                exercise_id=match.exercise_id,
                suggestions=[DictationSuggestion(id=option.id, name=option.name) for option in match.suggestions],
            )
            for name, match in matches.items()
        ],
    )


@router.post("/workouts")
def import_workouts(
    payload: WorkoutImportIn, session: SessionDep, user: CurrentUser, settings: SettingsDep
) -> WorkoutImportResult:
    """Saves the new workouts in the file. Every exercise name must have a match, found or chosen."""
    parsed = _parse(payload, settings)
    new, duplicates = _split_new(session, user, parsed.workouts)
    chosen = {
        name: payload.exercise_ids.get(name, match.exercise_id) for name, match in _matches(session, user, new).items()
    }
    if missing := [name for name, exercise_id in chosen.items() if exercise_id is None]:
        raise HTTPException(UNPROCESSABLE, detail=f"Exercises without a match: {missing}")
    ensure_exercises_visible(session, user, (exercise_id for exercise_id in chosen.values() if exercise_id is not None))

    saved_sets = 0
    for imported in new:
        workout = Workout(
            user_id=user.id, started_at=imported.started_at, ended_at=imported.ended_at, notes=imported.notes
        )
        # Two names in the file can be the same exercise here, so sets are numbered per exercise id.
        numbers: dict[int, int] = {}
        for item in imported.sets:
            exercise_id = chosen[item.exercise]
            assert exercise_id is not None
            numbers[exercise_id] = numbers.get(exercise_id, 0) + 1
            if numbers[exercise_id] > MAX_SETS_PER_EXERCISE:
                continue
            workout.sets.append(
                WorkoutSet(
                    exercise_id=exercise_id,
                    set_number=numbers[exercise_id],
                    reps=item.reps,
                    weight_kg=item.weight_kg,
                    rpe=item.rpe,
                    is_warmup=item.is_warmup,
                )
            )
        saved_sets += len(workout.sets)
        session.add(workout)
    session.commit()
    return WorkoutImportResult(workouts=len(new), sets=saved_sets, duplicates=duplicates)
