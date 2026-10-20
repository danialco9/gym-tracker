"""HTTP API routers."""

from fastapi import APIRouter

from gym_tracker.api import (
    auth,
    dictation,
    exercises,
    feedback,
    health,
    history,
    measurements,
    progress,
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
    measurements,
    progress,
    ranking,
    dictation,
    feedback,
):
    api_router.include_router(module.router)
