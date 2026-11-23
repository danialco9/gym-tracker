"""HTTP API routers."""

from fastapi import APIRouter

from gym_tracker.api import (
    auth,
    dictation,
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
