"""Cookie-based authentication endpoints."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, HTTPException, Response, status

from gym_tracker.api.common import commit_or_conflict
from gym_tracker.api.deps import (
    ACCESS_TOKEN_COOKIE,
    ClientAddress,
    CurrentUser,
    MailerDep,
    RateLimiterDep,
    SessionDep,
    SettingsDep,
    set_session_cookie,
)
from gym_tracker.config import Settings
from gym_tracker.mail import Email, Mailer
from gym_tracker.password_reset import create_reset_token, reset_email, reset_password
from gym_tracker.rate_limit import (
    DEMO_PER_CLIENT,
    LOGIN_PER_CLIENT_AND_EMAIL,
    LOGIN_PER_EMAIL,
    PASSWORD_RESET_PER_CLIENT,
    PASSWORD_RESET_PER_EMAIL,
    REGISTER_PER_CLIENT,
    Check,
)
from gym_tracker.schemas import (
    DeleteAccountRequest,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RegisterRequest,
    UserRead,
    UserUpdate,
)
from gym_tracker.security import verify_password
from gym_tracker.users import (
    UserAlreadyExistsError,
    authenticate,
    create_user,
    delete_user,
    get_user_by_email,
    normalize_email,
)

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

EMAIL_TAKEN = "An account with this email already exists"


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    response: Response,
    *,
    session: SessionDep,
    settings: SettingsDep,
    limiter: RateLimiterDep,
    client: ClientAddress,
) -> UserRead:
    """Create an account and sign it in. Limited per client address."""
    limiter.hit(Check(REGISTER_PER_CLIENT, ("register", client)))
    try:
        user = create_user(session, email=payload.email, password=payload.password)
    except UserAlreadyExistsError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=EMAIL_TAKEN) from error
    # A concurrent registration with the same email fails on the unique constraint.
    commit_or_conflict(session, EMAIL_TAKEN)
    # Someone who has just signed up is almost always on their own device: keep them in.
    set_session_cookie(response, user.id, settings, remember=True)
    return UserRead.model_validate(user)


@router.post("/login", status_code=status.HTTP_204_NO_CONTENT)
def login(
    credentials: LoginRequest,
    response: Response,
    *,
    session: SessionDep,
    settings: SettingsDep,
    limiter: RateLimiterDep,
    client: ClientAddress,
) -> None:
    """Sign in. Attempts are limited per client address and email, and per email."""
    email = normalize_email(credentials.email)
    limiter.hit(
        Check(LOGIN_PER_CLIENT_AND_EMAIL, ("login", client, email)),
        Check(LOGIN_PER_EMAIL, ("login", email)),
    )
    user = authenticate(session, email=credentials.email, password=credentials.password)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    set_session_cookie(response, user.id, settings, remember=credentials.remember)


@router.post("/demo", status_code=status.HTTP_204_NO_CONTENT)
def demo_login(
    response: Response,
    *,
    session: SessionDep,
    settings: SettingsDep,
    limiter: RateLimiterDep,
    client: ClientAddress,
) -> None:
    """Sign in to the public demo account without a password, when the demo is enabled."""
    user = get_user_by_email(session, settings.demo_email) if settings.demo_enabled else None
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Demo not available")
    limiter.hit(Check(DEMO_PER_CLIENT, ("demo", client)))
    # A shared public account: never kept past closing the browser.
    set_session_cookie(response, user.id, settings, remember=False)


def _send_quietly(mailer: Mailer, email: Email) -> None:
    try:
        mailer.send(email)
    except Exception:
        # The answer went out already and must not depend on the email: log it and move on.
        logger.exception("Could not send the password reset email")


@router.post("/password-reset", status_code=status.HTTP_204_NO_CONTENT)
def request_password_reset(
    payload: PasswordResetRequest,
    background: BackgroundTasks,
    *,
    session: SessionDep,
    settings: SettingsDep,
    mailer: MailerDep,
    limiter: RateLimiterDep,
    client: ClientAddress,
) -> None:
    """Email a link to choose a new password.

    The answer is the same whether or not the account exists, so this cannot tell which emails are
    registered; the email, by far the slowest part, goes out after the answer, so the timing does
    not give it away either. The demo account has no real inbox and gets no email.
    """
    email = normalize_email(payload.email)
    limiter.hit(
        Check(PASSWORD_RESET_PER_CLIENT, ("password-reset", client)),
        Check(PASSWORD_RESET_PER_EMAIL, ("password-reset", email)),
    )
    user = get_user_by_email(session, email)
    if user is None or user.email == normalize_email(settings.demo_email):
        return
    ttl = timedelta(minutes=settings.password_reset_ttl_minutes)
    token = create_reset_token(session, user, now=datetime.now(UTC), ttl=ttl)
    session.commit()
    # In the fragment, the token never reaches a server log or a Referer header.
    link = f"{settings.app_url.rstrip('/')}/restablecer#token={token}"
    background.add_task(_send_quietly, mailer, reset_email(user.email, link, settings.password_reset_ttl_minutes))


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
def confirm_password_reset(
    payload: PasswordResetConfirm,
    *,
    session: SessionDep,
    limiter: RateLimiterDep,
    client: ClientAddress,
) -> None:
    """Set the new password from an emailed link. Every link of that account stops working."""
    limiter.hit(Check(PASSWORD_RESET_PER_CLIENT, ("password-reset-confirm", client)))
    user = reset_password(session, payload.token, payload.password, now=datetime.now(UTC))
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid or expired link")
    session.commit()


def _clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(ACCESS_TOKEN_COOKIE, httponly=True, secure=settings.cookie_secure, samesite="lax")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, settings: SettingsDep) -> None:
    _clear_session_cookie(response, settings)


@router.get("/me")
def read_current_user(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.patch("/me")
def update_current_user(payload: UserUpdate, session: SessionDep, user: CurrentUser) -> UserRead:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    session.commit()
    return UserRead.model_validate(user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    payload: DeleteAccountRequest,
    response: Response,
    *,
    user: CurrentUser,
    session: SessionDep,
    settings: SettingsDep,
    limiter: RateLimiterDep,
    client: ClientAddress,
) -> None:
    """Delete the signed-in account and all its data, after confirming the password.

    A wrong password answers 403, not 401: the session is still valid. Attempts count against the
    same limits as logging in, so this is no side door for guessing passwords.
    """
    if user.email == normalize_email(settings.demo_email):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="The demo account cannot be deleted")
    limiter.hit(
        Check(LOGIN_PER_CLIENT_AND_EMAIL, ("login", client, user.email)),
        Check(LOGIN_PER_EMAIL, ("login", user.email)),
    )
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Incorrect password")
    delete_user(session, user)
    session.commit()
    _clear_session_cookie(response, settings)
