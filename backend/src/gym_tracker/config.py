"""Application settings loaded from environment variables (prefix ``GYM_``) or ``.env``."""

from __future__ import annotations

from functools import lru_cache
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="GYM_", env_file=(".env", "../.env"), extra="ignore")

    # Required: a missing URL must fail at startup instead of silently trying localhost.
    database_url: str
    jwt_secret: SecretStr
    jwt_algorithm: str = "HS256"
    # "Mantener la sesión iniciada": a week, renewed while in use, so it ends after a week unused.
    access_token_ttl_minutes: int = 60 * 24 * 7
    token_renewal_after_minutes: int = 60 * 24
    # Otherwise the cookie goes when the browser closes, and the token lasts half a day at most.
    session_token_ttl_minutes: int = 60 * 12
    cookie_secure: bool = True
    cors_origins: list[str] = ["http://localhost:5173"]
    rate_limit_enabled: bool = True
    # ``memory://`` suits a single instance; use ``redis://host:6379`` when running several.
    rate_limit_storage: str = "memory://"
    # Public demo: POST /api/auth/demo signs in to this account (created with `gym-admin seed-demo`).
    demo_enabled: bool = False
    demo_email: str = "demo@gymtracker.dev"
    # Calendar days and weeks in the analytics (workout dates, "today") follow this IANA time zone.
    timezone: str = "Europe/Madrid"
    # Where the web app lives, for the links in emails (e.g. the password reset page).
    app_url: str = "http://localhost:5173"
    # Emails go out through Brevo when a key is set; without one they are written to the log.
    brevo_api_key: SecretStr | None = None
    mail_from: str | None = None
    mail_from_name: str = "Gym Tracker"
    password_reset_ttl_minutes: int = 30
    # Web Push ("Descanso terminado" on the lock screen): a VAPID key pair, made with `gym-admin vapid-keys`.
    # Without them the app offers no notifications.
    vapid_public_key: str | None = None
    vapid_private_key: SecretStr | None = None

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        """Accept the plain ``postgres://`` or ``postgresql://`` URLs that hosted databases (e.g. Neon) hand out."""
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value.removeprefix(prefix)
        return value

    @field_validator("timezone")
    @classmethod
    def check_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError(f"Unknown time zone: {value}") from error
        return value

    @property
    def zone(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # required values come from the environment
