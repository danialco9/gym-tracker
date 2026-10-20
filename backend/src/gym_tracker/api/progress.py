"""Progress analytics computed on demand from the user's training log."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Annotated

import pandas as pd
from fastapi import APIRouter, Depends
from sqlalchemy import select

from gym_tracker.analysis import (
    GOAL_PLANS,
    TrainingLog,
    achievements,
    personal_records,
    recommend,
    session_bests,
    volume_advice,
    volume_rules_for,
    weekly_volume_by_muscle,
    weekly_weight_change,
    weight_trend,
    working_sets,
)
from gym_tracker.analysis.database import load_user_log
from gym_tracker.api.common import not_found, visible_to
from gym_tracker.api.deps import CurrentUser, SessionDep, SettingsDep, get_current_user
from gym_tracker.models import Exercise
from gym_tracker.schemas import (
    AchievementsRead,
    ActivityRead,
    BadgeRead,
    BodyWeightPointRead,
    BodyWeightRead,
    ExerciseProgressRead,
    ExerciseSessionRead,
    GoalPlanRead,
    IntRangeRead,
    LevelRead,
    MissionRead,
    MuscleVolumeRead,
    PerformedSetRead,
    PersonalRecordRead,
    PlannedSetRead,
    ProgressOverviewRead,
    RangeRead,
    RecommendationRead,
    StreakRead,
    VolumeAdviceRead,
    WeeklyVolumeRead,
)

router = APIRouter(prefix="/progress", tags=["progress"])

VOLUME_WEEKS = 8


def get_today(settings: SettingsDep) -> date:
    """Today in the configured time zone, so weeks turn over at local midnight."""
    return datetime.now(settings.zone).date()


TodayDep = Annotated[date, Depends(get_today)]


def _activity(log: TrainingLog, today: date) -> ActivityRead:
    days = log.workouts["date"].dt.date
    return ActivityRead(
        workouts_total=len(days),
        workouts_last_7_days=int((days > today - timedelta(days=7)).sum()),
        workouts_last_28_days=int((days > today - timedelta(days=28)).sum()),
        last_workout_on=days.max() if len(days) else None,
    )


def _recommendations(log: TrainingLog, today: date) -> list[RecommendationRead]:
    return [
        RecommendationRead(
            exercise_id=int(item.exercise_id),
            exercise_name=item.exercise_name,
            action=item.action,
            reason=item.reason,
            increment_kg=item.increment_kg,
            last_performed_on=item.last_performed_on,
            last_sets=[PerformedSetRead(reps=s.reps, weight_kg=s.weight_kg, rpe=s.rpe) for s in item.last_sets],
            target_sets=[PlannedSetRead(reps=s.reps, weight_kg=s.weight_kg) for s in item.target_sets],
            suggested_sets=[PlannedSetRead(reps=s.reps, weight_kg=s.weight_kg) for s in item.suggested_sets],
        )
        for item in recommend(log, today=today)
    ]


def _volume_advice(log: TrainingLog, today: date, goal: str | None) -> list[VolumeAdviceRead]:
    rules = volume_rules_for(goal)
    return [
        VolumeAdviceRead(
            muscle_group=item.muscle_group,
            average_hard_sets=item.average_hard_sets,
            status=item.status,
            weeks=item.weeks,
            min_hard_sets=rules.min_hard_sets,
            max_hard_sets=rules.max_hard_sets,
        )
        for item in volume_advice(log, today, rules)
    ]


def _personal_records(log: TrainingLog, work: pd.DataFrame, bests: pd.DataFrame) -> list[PersonalRecordRead]:
    exercises = log.exercises.set_index("exercise_id")
    sessions = bests.groupby("exercise_id")["workout_id"].nunique()
    records = [
        PersonalRecordRead(
            exercise_id=int(record["exercise_id"]),
            exercise_name=str(exercises.at[record["exercise_id"], "name"]),
            muscle_group=str(exercises.at[record["exercise_id"], "muscle_group"]),
            sessions=int(sessions[record["exercise_id"]]),
            best_e1rm_kg=round(float(record["best_e1rm_kg"]), 1),
            best_e1rm_on=record["best_e1rm_date"].date(),
            max_weight_kg=float(record["max_weight_kg"]),
            max_weight_on=record["max_weight_date"].date(),
        )
        for record in personal_records(work).to_dict(orient="records")
    ]
    return sorted(records, key=lambda record: record.exercise_name)


def _weekly_volume(log: TrainingLog, work: pd.DataFrame, today: date) -> list[WeeklyVolumeRead]:
    """Hard sets per muscle for the current week and the previous ones, including empty weeks."""
    current_week = today - timedelta(days=today.weekday())
    weeks = [current_week - timedelta(weeks=offset) for offset in reversed(range(VOLUME_WEEKS))]
    volume = weekly_volume_by_muscle(work, log.exercises) if not work.empty else pd.DataFrame()
    by_week: dict[date, list[MuscleVolumeRead]] = {week: [] for week in weeks}
    for row in volume.to_dict(orient="records"):
        week = row["week_start"].date()
        if week in by_week:
            by_week[week].append(
                MuscleVolumeRead(
                    muscle_group=str(row["muscle_group"]),
                    hard_sets=int(row["hard_sets"]),
                    volume_kg=round(float(row["volume_kg"]), 1),
                )
            )
    return [WeeklyVolumeRead(week_start=week, muscles=muscles) for week, muscles in by_week.items()]


def _body_weight(log: TrainingLog) -> BodyWeightRead:
    trend = weight_trend(log.body_measurements)
    change = weekly_weight_change(log.body_measurements)
    return BodyWeightRead(
        entries=[
            BodyWeightPointRead(
                measured_on=row["date"].date(),
                weight_kg=float(row["weight_kg"]),
                trend_kg=round(float(row["trend_kg"]), 2),
            )
            for row in trend.to_dict(orient="records")
        ],
        weekly_change_kg=None if change is None else round(change, 2),
    )


@router.get("/overview")
def read_overview(
    session: SessionDep, user: CurrentUser, settings: SettingsDep, today: TodayDep
) -> ProgressOverviewRead:
    """Activity, next-session recommendations, records, weekly volume and body weight trend."""
    log = load_user_log(session, user.id, settings.zone)
    work = working_sets(log)
    bests = session_bests(work)
    return ProgressOverviewRead(
        activity=_activity(log, today),
        recommendations=_recommendations(log, today),
        personal_records=_personal_records(log, work, bests) if not work.empty else [],
        weekly_volume=_weekly_volume(log, work, today),
        volume_advice=_volume_advice(log, today, user.goal),
        body_weight=_body_weight(log),
    )


@router.get("/goals", dependencies=[Depends(get_current_user)])
def read_goal_plans() -> list[GoalPlanRead]:
    """The reps, effort, rest and weekly sets each training goal asks for."""
    return [
        GoalPlanRead(
            goal=goal,
            compound_reps=IntRangeRead(min=plan.compound_reps[0], max=plan.compound_reps[1]),
            isolation_reps=IntRangeRead(min=plan.isolation_reps[0], max=plan.isolation_reps[1]),
            rpe=RangeRead(min=plan.rpe[0], max=plan.rpe[1]),
            rest_seconds=IntRangeRead(min=plan.rest_seconds[0], max=plan.rest_seconds[1]),
            weekly_hard_sets=IntRangeRead(min=plan.volume.min_hard_sets, max=plan.volume.max_hard_sets),
        )
        for goal, plan in GOAL_PLANS.items()
    ]


@router.get("/achievements")
def read_achievements(
    session: SessionDep, user: CurrentUser, settings: SettingsDep, today: TodayDep
) -> AchievementsRead:
    """Level and XP, the training streak, this week's missions and every badge, from the history."""
    result = achievements(load_user_log(session, user.id, settings.zone), today)
    return AchievementsRead(
        level=LevelRead(
            number=result.level.number,
            xp=result.level.xp,
            level_xp=result.level.level_xp,
            level_size_xp=result.level.level_size_xp,
        ),
        streak=StreakRead(
            current_days=result.streak.current_days,
            best_days=result.streak.best_days,
            last_workout_on=result.streak.last_workout_on,
            at_risk=result.streak.at_risk,
        ),
        missions=[
            MissionRead(kind=mission.kind, progress=mission.progress, target=mission.target, done=mission.done)
            for mission in result.missions
        ],
        badges=[BadgeRead(kind=badge.kind, earned_on=badge.earned_on) for badge in result.badges],
    )


@router.get("/exercises/{exercise_id}")
def read_exercise_progress(
    exercise_id: int, session: SessionDep, user: CurrentUser, settings: SettingsDep
) -> ExerciseProgressRead:
    """Best estimated 1RM, top weight and volume of every session that included the exercise."""
    name = session.scalar(select(Exercise.name).where(Exercise.id == exercise_id, visible_to(user)))
    if name is None:
        raise not_found("Exercise")
    work = working_sets(load_user_log(session, user.id, settings.zone))
    bests = session_bests(work[work["exercise_id"] == str(exercise_id)])
    return ExerciseProgressRead(
        exercise_id=exercise_id,
        exercise_name=name,
        sessions=[
            ExerciseSessionRead(
                workout_id=int(row["workout_id"]),
                performed_on=row["date"].date(),
                best_e1rm_kg=round(float(row["best_e1rm_kg"]), 1),
                top_weight_kg=float(row["top_weight_kg"]),
                working_sets=int(row["working_sets"]),
                total_reps=int(row["total_reps"]),
                volume_kg=round(float(row["volume_kg"]), 1),
            )
            for row in bests.to_dict(orient="records")
        ],
    )
