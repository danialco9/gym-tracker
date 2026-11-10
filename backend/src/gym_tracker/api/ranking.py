"""The strength ranking: the user's tier from Bronze to Master by percentile, per exercise and per zone.

Everyone is compared with gym-goers at large, never with the app's other users, so the ranking has
no list of people: each user sees only their own standing.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import APIRouter
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from gym_tracker.analysis.strength import (
    BODYWEIGHT_LIFTS,
    MAX_ESTIMATED_REPS,
    ZONES,
    Standard,
    Zone,
    estimated_max,
    estimated_percentile,
    standard_for,
    tier_for,
    zone_score,
)
from gym_tracker.api.deps import CurrentUser, SessionDep
from gym_tracker.enums import Equipment, MuscleGroup, Sex
from gym_tracker.models import BodyMeasurement, Exercise, Workout, WorkoutSet
from gym_tracker.schemas import MyLiftRead, MyRankingRead, RankedExerciseRead, ZoneStandingRead

router = APIRouter(prefix="/ranking", tags=["ranking"])


@dataclass(frozen=True)
class _RankedExercise:
    id: int
    slug: str
    name: str
    zone: Zone
    standard: Standard


@dataclass(frozen=True)
class _Best:
    # Estimated one-rep max, body included on bodyweight lifts.
    max_kg: float
    weight_kg: float
    reps: int


def _ranked_exercises(session: Session) -> dict[int, _RankedExercise]:
    """Catalog exercises with standards; custom ones have nothing to be compared with."""
    rows = session.execute(
        select(Exercise.id, Exercise.slug, Exercise.name, Exercise.muscle_group, Exercise.equipment).where(
            Exercise.user_id.is_(None)
        )
    )
    ranked = {}
    for id_, slug, name, muscle_group, equipment in rows:
        muscle = MuscleGroup(muscle_group)
        standard = standard_for(slug, muscle, Equipment(equipment) if equipment else None)
        if standard is not None:
            ranked[id_] = _RankedExercise(id_, slug, name, ZONES[muscle], standard)
    return ranked


def _body_weight(session: Session, user_id: int) -> float | None:
    """The user's latest logged body weight."""
    weight = session.scalar(
        select(BodyMeasurement.weight_kg)
        .where(BodyMeasurement.user_id == user_id, BodyMeasurement.weight_kg.is_not(None))
        .order_by(BodyMeasurement.measured_on.desc())
        .limit(1)
    )
    return float(weight) if weight is not None else None


def _best_lifts(
    session: Session, user_id: int, body_weight_kg: float, exercises: dict[int, _RankedExercise]
) -> dict[int, _Best]:
    """The user's set with the best estimated max, per ranked exercise id."""
    # One row per distinct load and rep count, which is all the best estimate needs.
    reps = func.least(WorkoutSet.reps, MAX_ESTIMATED_REPS)
    sets = session.execute(
        select(WorkoutSet.exercise_id, WorkoutSet.weight_kg, reps)
        .join(Workout)
        .where(
            Workout.user_id == user_id,
            ~WorkoutSet.is_warmup,
            WorkoutSet.reps >= 1,
            WorkoutSet.exercise_id.in_(exercises),
        )
        .group_by(WorkoutSet.exercise_id, WorkoutSet.weight_kg, reps)
    )
    best: dict[int, _Best] = {}
    for exercise_id, weight_kg, set_reps in sets:
        added = float(weight_kg)
        load = added + (body_weight_kg if exercises[exercise_id].slug in BODYWEIGHT_LIFTS else 0)
        if load <= 0:
            continue
        max_kg = estimated_max(load, set_reps)
        if exercise_id not in best or max_kg > best[exercise_id].max_kg:
            best[exercise_id] = _Best(max_kg, added, set_reps)
    return best


def _percent(share: float) -> float:
    return round(share * 100, 1)


@router.get("/zones")
def read_my_ranking(session: SessionDep, user: CurrentUser) -> MyRankingRead:
    """The user's tier in every zone and in every ranked exercise they have done.

    Each lift is placed among gym-goers of the user's body weight and sex; without a body weight
    logged there is no tier.
    """
    exercises = _ranked_exercises(session)
    body_weight_kg = _body_weight(session, user.id)
    sex = Sex(user.sex) if user.sex else None
    best: dict[int, _Best] = {}
    # The share of gym-goers under each of those lifts, from 0 to 1.
    shares: dict[int, float] = {}
    if body_weight_kg is not None:
        best = _best_lifts(session, user.id, body_weight_kg, exercises)
        shares = {
            exercise_id: estimated_percentile(lift.max_kg, body_weight_kg, exercises[exercise_id].standard, sex)
            for exercise_id, lift in best.items()
        }

    zones = []
    for zone in Zone:
        in_zone = [share for exercise_id, share in shares.items() if exercises[exercise_id].zone is zone]
        score = zone_score(in_zone) if in_zone else None
        standing = tier_for(score) if score is not None else None
        zones.append(
            ZoneStandingRead(
                zone=zone,
                tier=standing.tier if standing else None,
                progress=standing.progress if standing else None,
                percentile=_percent(score) if score is not None else None,
            )
        )
    order = list(Zone)
    lifts = []
    for exercise_id, share in shares.items():
        exercise, lift, tier = exercises[exercise_id], best[exercise_id], tier_for(share)
        lifts.append(
            MyLiftRead(
                exercise=RankedExerciseRead(id=exercise_id, name=exercise.name),
                zone=exercise.zone,
                tier=tier.tier,
                progress=tier.progress,
                percentile=_percent(share),
                weight_kg=lift.weight_kg,
                reps=lift.reps,
            )
        )
    lifts.sort(key=lambda lift: (order.index(lift.zone), -lift.percentile, lift.exercise.name))
    return MyRankingRead(needs_body_weight=body_weight_kg is None, zones=zones, lifts=lifts)
