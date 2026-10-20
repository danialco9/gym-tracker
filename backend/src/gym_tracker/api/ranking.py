"""The public strength ranking: tiers from Bronze to Master, overall and per exercise."""

from __future__ import annotations

from dataclasses import dataclass, field

from fastapi import APIRouter
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from gym_tracker.analysis.strength import (
    BODYWEIGHT_LIFTS,
    MAX_ESTIMATED_REPS,
    estimated_max,
    lift_score,
    master_ratio,
    overall_score,
    tier_for,
)
from gym_tracker.api.common import not_found
from gym_tracker.api.deps import CurrentUser, SessionDep, SettingsDep
from gym_tracker.enums import Equipment, MuscleGroup
from gym_tracker.models import BodyMeasurement, Exercise, User, Workout, WorkoutSet
from gym_tracker.schemas import (
    ExerciseRankingRead,
    RankedExerciseRead,
    RankingEntryRead,
    RankingMeRead,
    RankingRead,
)
from gym_tracker.users import normalize_email

router = APIRouter(prefix="/ranking", tags=["ranking"])


@dataclass(frozen=True)
class _RankedExercise:
    id: int
    slug: str
    name: str
    ratio: float


@dataclass
class _Lifter:
    id: int
    name: str
    # Hidden lifters still get their own tier; they are only left off the list.
    listed: bool
    body_weight_kg: float | None
    # Score per ranked exercise id, from 0 to 1 (Master).
    scores: dict[int, float] = field(default_factory=dict)

    @property
    def overall(self) -> float:
        return overall_score(list(self.scores.values()))


def _ranked_exercises(session: Session) -> dict[int, _RankedExercise]:
    """Catalog exercises with a scale; custom ones cannot be compared between users."""
    rows = session.execute(
        select(Exercise.id, Exercise.slug, Exercise.name, Exercise.muscle_group, Exercise.equipment).where(
            Exercise.user_id.is_(None)
        )
    )
    ranked = {}
    for id_, slug, name, muscle_group, equipment in rows:
        ratio = master_ratio(slug, MuscleGroup(muscle_group), Equipment(equipment) if equipment else None)
        if ratio is not None:
            ranked[id_] = _RankedExercise(id_, slug, name, ratio)
    return ranked


def _lifters(session: Session, demo_email: str, exercises: dict[int, _RankedExercise]) -> dict[int, _Lifter]:
    """Every user with their latest body weight and score per ranked lift; the demo is never listed."""
    demo = normalize_email(demo_email)
    latest_weights = session.execute(
        select(BodyMeasurement.user_id, BodyMeasurement.weight_kg)
        .where(BodyMeasurement.weight_kg.is_not(None))
        .order_by(BodyMeasurement.user_id, BodyMeasurement.measured_on.desc())
        .distinct(BodyMeasurement.user_id)
    )
    weights = {user_id: float(weight) for user_id, weight in latest_weights if weight is not None}
    lifters = {
        id_: _Lifter(
            id=id_,
            name=nickname or f"Atleta {id_}",
            listed=show_in_ranking and email != demo,
            body_weight_kg=weights.get(id_),
        )
        for id_, nickname, show_in_ranking, email in session.execute(
            select(User.id, User.nickname, User.show_in_ranking, User.email)
        )
    }

    # One row per distinct load and rep count, which is all the best estimate needs.
    reps = func.least(WorkoutSet.reps, MAX_ESTIMATED_REPS)
    sets = session.execute(
        select(Workout.user_id, WorkoutSet.exercise_id, WorkoutSet.weight_kg, reps)
        .join(Workout)
        .where(~WorkoutSet.is_warmup, WorkoutSet.reps >= 1, WorkoutSet.exercise_id.in_(exercises))
        .group_by(Workout.user_id, WorkoutSet.exercise_id, WorkoutSet.weight_kg, reps)
    )
    for user_id, exercise_id, weight_kg, set_reps in sets:
        lifter = lifters[user_id]
        if lifter.body_weight_kg is None:
            continue
        exercise = exercises[exercise_id]
        load = float(weight_kg) + (lifter.body_weight_kg if exercise.slug in BODYWEIGHT_LIFTS else 0)
        if load > 0:
            score = lift_score(estimated_max(load, set_reps), lifter.body_weight_kg, exercise.ratio)
            lifter.scores[exercise_id] = max(lifter.scores.get(exercise_id, 0.0), score)
    return lifters


def _board(
    lifters: dict[int, _Lifter], me: User, score_of: dict[int, float]
) -> tuple[RankingMeRead, list[RankingEntryRead]]:
    """The list, best first (ties by seniority), and the user's own standing."""
    listed = sorted(
        (lifter for lifter in lifters.values() if lifter.listed and lifter.id in score_of),
        key=lambda lifter: (-score_of[lifter.id], lifter.id),
    )
    entries = [
        RankingEntryRead(
            position=position,
            name=lifter.name,
            tier=tier_for(score_of[lifter.id]).tier,
            is_me=lifter.id == me.id,
        )
        for position, lifter in enumerate(listed, start=1)
    ]
    mine = tier_for(score_of[me.id]) if me.id in score_of else None
    standing = RankingMeRead(
        tier=mine.tier if mine else None,
        progress=mine.progress if mine else None,
        position=next((entry.position for entry in entries if entry.is_me), None),
        needs_body_weight=lifters[me.id].body_weight_kg is None,
        show_in_ranking=me.show_in_ranking,
    )
    return standing, entries


@router.get("")
def read_ranking(session: SessionDep, user: CurrentUser, settings: SettingsDep) -> RankingRead:
    """Everyone's overall tier: the mean of their five best lifts relative to body weight."""
    exercises = _ranked_exercises(session)
    lifters = _lifters(session, settings.demo_email, exercises)
    scores = {lifter.id: lifter.overall for lifter in lifters.values() if lifter.scores}
    me, entries = _board(lifters, user, scores)
    lifted = {
        exercise_id
        for lifter in lifters.values()
        if lifter.listed or lifter.id == user.id
        for exercise_id in lifter.scores
    }
    return RankingRead(
        me=me,
        entries=entries,
        exercises=sorted(
            (RankedExerciseRead(id=id_, name=exercises[id_].name) for id_ in lifted),
            key=lambda exercise: exercise.name,
        ),
    )


@router.get("/exercises/{exercise_id}")
def read_exercise_ranking(
    exercise_id: int, session: SessionDep, user: CurrentUser, settings: SettingsDep
) -> ExerciseRankingRead:
    """Everyone's tier in one ranked exercise."""
    exercises = _ranked_exercises(session)
    if exercise_id not in exercises:
        raise not_found("Ranked exercise")
    lifters = _lifters(session, settings.demo_email, exercises)
    scores = {lifter.id: lifter.scores[exercise_id] for lifter in lifters.values() if exercise_id in lifter.scores}
    me, entries = _board(lifters, user, scores)
    return ExerciseRankingRead(
        exercise=RankedExerciseRead(id=exercise_id, name=exercises[exercise_id].name), me=me, entries=entries
    )
