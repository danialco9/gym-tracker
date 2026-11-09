"""Shared FastAPI dependencies."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from gym_tracker.config import Settings, get_settings
from gym_tracker.db import get_session
from gym_tracker.mail import Mailer, get_mailer
from gym_tracker.models import User
from gym_tracker.rate_limit import RateLimiter
from gym_tracker.security import create_access_token, decode_access_token, needs_renewal, token_ttl

ACCESS_TOKEN_COOKIE = "access_token"

SessionDep = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_today(settings: SettingsDep) -> date:
    """Today in the configured time zone, so weeks turn over at local midnight."""
    return datetime.now(settings.zone).date()


TodayDep = Annotated[date, Depends(get_today)]


def set_session_cookie(response: Response, user_id: int, settings: Settings, *, remember: bool) -> None:
    """Sign in. A remembered session survives closing the browser; any other lives only until then."""
    response.set_cookie(
        ACCESS_TOKEN_COOKIE,
        create_access_token(str(user_id), settings, remember=remember),
        max_age=int(token_ttl(settings, remember=True).total_seconds()) if remember else None,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def get_current_user(
    session: SessionDep,
    settings: SettingsDep,
    response: Response,
    access_token: Annotated[str | None, Cookie()] = None,
) -> User:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token = decode_access_token(access_token, settings) if access_token else None
    if token is None or not token.subject.isdigit():
        raise unauthorized
    user = session.get(User, int(token.subject))
    if user is None:
        raise unauthorized
    if needs_renewal(token, settings):
        set_session_cookie(response, user.id, settings, remember=True)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_rate_limiter(request: Request) -> RateLimiter:
    limiter: RateLimiter = request.app.state.rate_limiter
    return limiter


RateLimiterDep = Annotated[RateLimiter, Depends(get_rate_limiter)]


def get_app_mailer(settings: SettingsDep) -> Mailer:
    return get_mailer(settings)


MailerDep = Annotated[Mailer, Depends(get_app_mailer)]


def get_client_address(request: Request) -> str:
    """The caller's IP. Behind a reverse proxy, run uvicorn with ``--proxy-headers`` so this is the real client."""
    return request.client.host if request.client else "unknown"


ClientAddress = Annotated[str, Depends(get_client_address)]
