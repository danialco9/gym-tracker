"""FastAPI application factory: ``uv run uvicorn gym_tracker.main:create_app --factory --reload``."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from gym_tracker.api import api_router
from gym_tracker.config import Settings, get_settings
from gym_tracker.error_reporting import init_error_reporting
from gym_tracker.rate_limit import RateLimiter


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    # Before the app exists, so Sentry hooks into FastAPI and Starlette.
    init_error_reporting(settings.sentry_dsn)
    app = FastAPI(title="Gym Tracker API", version="0.1.0")
    app.state.rate_limiter = RateLimiter(settings.rate_limit_storage, enabled=settings.rate_limit_enabled)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)
    return app
