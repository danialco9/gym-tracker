"""Notes someone keeps on an exercise, such as the seat height of a machine, shown each time it is trained."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select

from gym_tracker.api.common import ensure_exercises_visible
from gym_tracker.api.deps import CurrentUser, SessionDep
from gym_tracker.models import ExerciseNote
from gym_tracker.schemas import ExerciseNoteIn, ExerciseNoteRead

router = APIRouter(prefix="/exercise-notes", tags=["exercise notes"])


@router.get("")
def list_notes(session: SessionDep, user: CurrentUser) -> list[ExerciseNoteRead]:
    """Every note of the user, fetched once for a whole workout."""
    notes = session.scalars(
        select(ExerciseNote).where(ExerciseNote.user_id == user.id).order_by(ExerciseNote.exercise_id)
    )
    return [ExerciseNoteRead(exercise_id=note.exercise_id, text=note.text) for note in notes]


@router.put("/{exercise_id}")
def save_note(exercise_id: int, payload: ExerciseNoteIn, session: SessionDep, user: CurrentUser) -> ExerciseNoteRead:
    """Write the note of an exercise, replacing the one before; an empty note deletes it."""
    ensure_exercises_visible(session, user, [exercise_id])
    note = session.get(ExerciseNote, (user.id, exercise_id))
    if not payload.text:
        if note is not None:
            session.delete(note)
            session.commit()
        return ExerciseNoteRead(exercise_id=exercise_id, text="")
    if note is None:
        note = ExerciseNote(user_id=user.id, exercise_id=exercise_id, text=payload.text)
        session.add(note)
    else:
        note.text = payload.text
    session.commit()
    return ExerciseNoteRead(exercise_id=exercise_id, text=note.text)
