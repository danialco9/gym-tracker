"""HTTP API routers."""

from fastapi import APIRouter

from gym_tracker.api import (
    auth,
    dictation,
    exercise_notes,
    exercises,
    export,
    feedback,
    health,
    history,
    importing,
    measurements,
    plan,
    progress,
    push,
    ranking,
    routines,
    workouts,
)

api_router = APIRouter(prefix="/api")
for module in (
    health,
    auth,
    exercises,
    exercise_notes,
    history,
    routines,
    workouts,
    plan,
    measurements,
    progress,
    ranking,
    dictation,
    export,
    importing,
    feedback,
    push,
):
    api_router.include_router(module.router)
