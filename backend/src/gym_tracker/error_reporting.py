"""Unhandled errors in production go to Sentry, with the technical detail and nothing personal.

Only switched on when a DSN is set (on Vercel, ``SENTRY_DSN`` comes from the Sentry integration), so
local development and the tests send nothing.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

import sentry_sdk

if TYPE_CHECKING:
    from sentry_sdk._types import DataCollectionUserOptions

# Which request headers may travel with an error: enough to tell the device and the kind of request.
_HEADERS_KEPT = ["user-agent", "content-type", "accept-language"]

# Nothing that identifies a person or their training: no user, cookies, bodies (passwords, sets and
# measurements travel there), query strings, SQL parameters or local variables of the failing code.
DATA_COLLECTION: DataCollectionUserOptions = {
    "user_info": False,
    "cookies": {"mode": "off"},
    "http_headers": {"request": {"mode": "allowlist", "terms": _HEADERS_KEPT}},
    "http_bodies": [],
    "url_query_params": {"mode": "off"},
    "database_query_data": False,
    "stack_frame_variables": False,
}


def init_error_reporting(dsn: str | None) -> bool:
    """Start reporting unhandled errors to Sentry; returns whether it did."""
    if not dsn:
        return False
    sentry_sdk.init(
        dsn=dsn,
        # Vercel says which deployment this is: production, preview or development.
        environment=os.environ.get("VERCEL_ENV", "development"),
        release=os.environ.get("VERCEL_GIT_COMMIT_SHA") or None,
        data_collection=DATA_COLLECTION,
        # Errors only: no performance tracing, which would use up the free plan.
        traces_sample_rate=None,
    )
    return True
