"""The public strength ranking: tiers from Bronze to Master by percentile, per exercise and per zone."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from fastapi import APIRouter
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from gym_tracker.analysis.strength import (
    BODYWEIGHT_LIFTS,
    MAX_ESTIMATED_REPS,
    MIN_APP_LIFTERS,
    ZONES,
    PercentileSource,
    Zone,
    app_percentile,
    estimated_max,
    estimated_percentile,
    master_ratio,
    tier_for,
    zone_score,
)
from gym_tracker.api.common import not_found
from gym_tracker.api.deps import CurrentUser, SessionDep, SettingsDep
from gym_tracker.enums import Equipment, MuscleGroup, Sex
from gym_tracker.models import BodyMeasurement, Exercise, User, Workout, WorkoutSet
from gym_tracker.schemas import (
    ExerciseRankingRead,
    MyLiftRead,
    MyRankingRead,
    RankedExerciseRead,
    RankingEntryRead,
    RankingMeRead,
    ZoneRankingRead,
    ZoneStandingRead,
)
from gym_tracker.users import normalize_email

router = APIRouter(prefix="/ranking", tags=["ranking"])


@dataclass(frozen=True)
class _RankedExercise:
    id: int
    slug: str
    name: str
    zone: Zone
    scale: float


@dataclass(frozen=True)
class _Best:
    # Estimated max relative to body weight.
    ratio: float
    weight_kg: float
    reps: int


@dataclass(frozen=True)
class _Percentile:
    share: float
    source: PercentileSource


@dataclass
class _Lifter:
    id: int
    name: str
    # Hidden lifters still get their own tier; they are only left off the list and out of the
    # app's percentiles.
    listed: bool
    sex: Sex | None
    body_weight_kg: float | None
    # Best lift per ranked exercise id.
    best: dict[int, _Best] = field(default_factory=dict)
    # Percentile per ranked exercise id, filled in once everyone's best lifts are known.
    percentiles: dict[int, _Percentile] = field(default_factory=dict)

    def zone_percentile(self, exercises: dict[int, _RankedExercise], zone: Zone) -> float | None:
        shares = [p.share for id_, p in self.percentiles.items() if exercises[id_].zone is zone]
        return zone_score(shares) if shares else None


def _ranked_exercises(session: Session) -> dict[int, _RankedExercise]:
    """Catalog exercises with a scale; custom ones cannot be compared between users."""
    rows = session.execute(
        select(Exercise.id, Exercise.slug, Exercise.name, Exercise.muscle_group, Exercise.equipment).where(
            Exercise.user_id.is_(None)
        )
    )
    ranked = {}
    for id_, slug, name, muscle_group, equipment in rows:
        muscle = MuscleGroup(muscle_group)
        scale = master_ratio(slug, muscle, Equipment(equipment) if equipment else None)
        if scale is not None:
            ranked[id_] = _RankedExercise(id_, slug, name, ZONES[muscle], scale)
    return ranked


def _best_lifts(session: Session, demo_email: str, exercises: dict[int, _RankedExercise]) -> dict[int, _Lifter]:
    """Every user with their latest body weight and best set per ranked lift; the demo is never listed."""
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
            sex=Sex(sex) if sex else None,
            body_weight_kg=weights.get(id_),
        )
        for id_, nickname, show_in_ranking, email, sex in session.execute(
            select(User.id, User.nickname, User.show_in_ranking, User.email, User.sex)
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
        added = float(weight_kg)
        load = added + (lifter.body_weight_kg if exercises[exercise_id].slug in BODYWEIGHT_LIFTS else 0)
        if load <= 0:
            continue
        ratio = estimated_max(load, set_reps) / lifter.body_weight_kg
        best = lifter.best.get(exercise_id)
        if best is None or ratio > best.ratio:
            lifter.best[exercise_id] = _Best(ratio, added, set_reps)
    return lifters


def _lifters(session: Session, demo_email: str, exercises: dict[int, _RankedExercise]) -> dict[int, _Lifter]:
    """Everyone's best lifts with their percentiles.

    A lift is compared with the other listed lifters of the same sex (everyone, when unknown) once
    there are ``MIN_APP_LIFTERS`` of them; until then, with the estimate.
    """
    lifters = _best_lifts(session, demo_email, exercises)
    # Sorted ratios per exercise and sex; None holds everyone.
    pools: dict[tuple[int, Sex | None], list[float]] = defaultdict(list)
    for lifter in lifters.values():
        if lifter.listed:
            for exercise_id, best in lifter.best.items():
                pools[exercise_id, None].append(best.ratio)
                if lifter.sex is not None:
                    pools[exercise_id, lifter.sex].append(best.ratio)
    for pool in pools.values():
        pool.sort()

    for lifter in lifters.values():
        for exercise_id, best in lifter.best.items():
            others = pools.get((exercise_id, lifter.sex), [])
            if lifter.listed:
                others = others.copy()
                others.remove(best.ratio)
            if len(others) >= MIN_APP_LIFTERS:
                percentile = _Percentile(app_percentile(best.ratio, others), PercentileSource.APP)
            else:
                exercise = exercises[exercise_id]
                share = estimated_percentile(best.ratio, exercise.scale, exercise.zone, lifter.sex)
                percentile = _Percentile(share, PercentileSource.ESTIMATE)
            lifter.percentiles[exercise_id] = percentile
    return lifters


def _percent(share: float) -> float:
    return round(share * 100, 1)


def _board(
    lifters: dict[int, _Lifter],
    me: User,
    score_of: dict[int, float],
    source: PercentileSource | None = None,
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
        percentile=_percent(score_of[me.id]) if me.id in score_of else None,
        source=source if mine else None,
        position=next((entry.position for entry in entries if entry.is_me), None),
        needs_body_weight=lifters[me.id].body_weight_kg is None,
        show_in_ranking=me.show_in_ranking,
    )
    return standing, entries


def _lifted(lifters: dict[int, _Lifter], me: User, exercises: dict[int, _RankedExercise]) -> list[RankedExerciseRead]:
    """The given exercises that someone on the list or the user has lifted, by name."""
    lifted = {
        exercise_id
        for lifter in lifters.values()
        if lifter.listed or lifter.id == me.id
        for exercise_id in lifter.best
        if exercise_id in exercises
    }
    return sorted(
        (RankedExerciseRead(id=id_, name=exercises[id_].name) for id_ in lifted),
        key=lambda exercise: exercise.name,
    )


@router.get("/zones")
def read_my_ranking(session: SessionDep, user: CurrentUser, settings: SettingsDep) -> MyRankingRead:
    """The user's tier in every zone and in every ranked exercise they have done."""
    exercises = _ranked_exercises(session)
    lifters = _lifters(session, settings.demo_email, exercises)
    me = lifters[user.id]
    zones = []
    for zone in Zone:
        share = me.zone_percentile(exercises, zone)
        standing = tier_for(share) if share is not None else None
        zones.append(
            ZoneStandingRead(
                zone=zone,
                tier=standing.tier if standing else None,
                progress=standing.progress if standing else None,
                percentile=_percent(share) if share is not None else None,
            )
        )
    order = list(Zone)
    lifts = []
    for exercise_id, percentile in me.percentiles.items():
        exercise, best, standing = exercises[exercise_id], me.best[exercise_id], tier_for(percentile.share)
        lifts.append(
            MyLiftRead(
                exercise=RankedExerciseRead(id=exercise_id, name=exercise.name),
                zone=exercise.zone,
                tier=standing.tier,
                progress=standing.progress,
                percentile=_percent(percentile.share),
                source=percentile.source,
                weight_kg=best.weight_kg,
                reps=best.reps,
            )
        )
    lifts.sort(key=lambda lift: (order.index(lift.zone), -lift.percentile, lift.exercise.name))
    return MyRankingRead(
        needs_body_weight=me.body_weight_kg is None,
        show_in_ranking=user.show_in_ranking,
        zones=zones,
        lifts=lifts,
    )


@router.get("/zones/{zone}")
def read_zone_ranking(zone: Zone, session: SessionDep, user: CurrentUser, settings: SettingsDep) -> ZoneRankingRead:
    """Everyone's tier in one zone: the mean percentile of the zone's exercises each has done."""
    exercises = _ranked_exercises(session)
    lifters = _lifters(session, settings.demo_email, exercises)
    scores = {
        lifter.id: share
        for lifter in lifters.values()
        if (share := lifter.zone_percentile(exercises, zone)) is not None
    }
    me, entries = _board(lifters, user, scores)
    in_zone = {id_: exercise for id_, exercise in exercises.items() if exercise.zone is zone}
    return ZoneRankingRead(zone=zone, me=me, entries=entries, exercises=_lifted(lifters, user, in_zone))


@router.get("/exercises/{exercise_id}")
def read_exercise_ranking(
    exercise_id: int, session: SessionDep, user: CurrentUser, settings: SettingsDep
) -> ExerciseRankingRead:
    """Everyone's tier in one ranked exercise."""
    exercises = _ranked_exercises(session)
    if exercise_id not in exercises:
        raise not_found("Ranked exercise")
    lifters = _lifters(session, settings.demo_email, exercises)
    scores = {
        lifter.id: lifter.percentiles[exercise_id].share
        for lifter in lifters.values()
        if exercise_id in lifter.percentiles
    }
    mine = lifters[user.id].percentiles.get(exercise_id)
    me, entries = _board(lifters, user, scores, mine.source if mine else None)
    return ExerciseRankingRead(
        exercise=RankedExerciseRead(id=exercise_id, name=exercises[exercise_id].name), me=me, entries=entries
    )
