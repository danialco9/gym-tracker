"""Request rate limits for sensitive endpoints (login and registration)."""

from __future__ import annotations

import math
import time
from collections.abc import Sequence
from dataclasses import dataclass

from fastapi import HTTPException, status
from limits import RateLimitItem, parse
from limits.storage import storage_from_string
from limits.strategies import MovingWindowRateLimiter

TOO_MANY_ATTEMPTS = "Too many attempts, try again later"

# Several attempts a minute from one place stops password guessing against an account, and an
# hourly cap per account also slows attempts spread across many addresses.
LOGIN_PER_CLIENT_AND_EMAIL = parse("5/minute")
LOGIN_PER_EMAIL = parse("20/hour")
REGISTER_PER_CLIENT = parse("5/hour")
DEMO_PER_CLIENT = parse("20/hour")
# Reading a dictation is local and cheap today, but a language model behind it would not be.
DICTATION_PER_CLIENT = parse("60/hour")
FEEDBACK_PER_USER = parse("20/hour")
# A rest every minute or so for two hours is far more than a real workout asks for.
REST_PUSH_PER_USER = parse("120/hour")
# Each request sends an email: few per address, fewer per inbox, so nobody gets flooded.
PASSWORD_RESET_PER_CLIENT = parse("10/hour")
PASSWORD_RESET_PER_EMAIL = parse("3/hour")


@dataclass(frozen=True)
class Check:
    """One limit applied to one key, e.g. login attempts for this address and email."""

    limit: RateLimitItem
    key: Sequence[str]


class RateLimiter:
    """Moving-window limits over a ``limits`` storage (``memory://`` for a single instance, or ``redis://...``)."""

    def __init__(self, storage_uri: str = "memory://", *, enabled: bool = True) -> None:
        self._limiter = MovingWindowRateLimiter(storage_from_string(storage_uri))
        self._enabled = enabled

    def hit(self, *checks: Check) -> None:
        """Count one attempt against every check, or raise ``429`` if any of them is exhausted.

        Nothing is counted when the request is rejected, so waiting always frees a slot.
        """
        if not self._enabled:
            return
        blocked = [check for check in checks if not self._limiter.test(check.limit, *check.key)]
        if blocked:
            reset_at = max(self._limiter.get_window_stats(check.limit, *check.key).reset_time for check in blocked)
            retry_after = max(1, math.ceil(reset_at - time.time()))
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                detail=TOO_MANY_ATTEMPTS,
                headers={"Retry-After": str(retry_after)},
            )
        for check in checks:
            self._limiter.hit(check.limit, *check.key)
