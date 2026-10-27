"""Web Push: the "Descanso terminado" notification that reaches a locked phone.

An iPhone freezes a web app as soon as it is locked, so the phone cannot time the rest itself: the
server waits instead and asks the browser's push service (Apple, Google, Mozilla) to deliver it.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlsplit

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from pywebpush import WebPushException, webpush  # type: ignore[import-untyped]

# The server posts to whatever endpoint a browser hands over, so only the push services are accepted.
PUSH_SERVICE_HOSTS = ("push.apple.com", "fcm.googleapis.com", "push.services.mozilla.com", "notify.windows.com")
# Undelivered notifications are dropped after this long: a rest that ended minutes ago is no news.
TTL_SECONDS = 120
# The request waits out the rest, and Vercel's free plan stops a request after 300 seconds.
MAX_REST_SECONDS = 290


def is_push_service(endpoint: str) -> bool:
    parts = urlsplit(endpoint)
    host = parts.hostname or ""
    return parts.scheme == "https" and any(host == known or host.endswith(f".{known}") for known in PUSH_SERVICE_HOSTS)


def _base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def generate_vapid_keys() -> tuple[str, str]:
    """A ``(public, private)`` P-256 key pair, base64url-encoded as browsers and pywebpush expect it."""
    key = ec.generate_private_key(ec.SECP256R1())
    public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return _base64url(public), _base64url(key.private_numbers().private_value.to_bytes(32, "big"))


@dataclass(frozen=True)
class PushTarget:
    endpoint: str
    p256dh: str
    auth: str


class SubscriptionGoneError(Exception):
    """The push service no longer knows this device (notifications turned off, app removed)."""


class Pusher(Protocol):
    def send(self, target: PushTarget, message: dict[str, str]) -> None: ...


class WebPusher:
    """Sends through the real push services, signed with the server's VAPID key."""

    def __init__(self, private_key: str, subject: str) -> None:
        self._private_key = private_key
        # Push services want a way to reach whoever sends: an https URL or a mailto: address.
        self._subject = subject

    def send(self, target: PushTarget, message: dict[str, str]) -> None:
        try:
            webpush(
                subscription_info={"endpoint": target.endpoint, "keys": {"p256dh": target.p256dh, "auth": target.auth}},
                data=json.dumps(message),
                vapid_private_key=self._private_key,
                # A new dict each time: pywebpush writes the audience and expiry into it.
                vapid_claims={"sub": self._subject},
                ttl=TTL_SECONDS,
            )
        except WebPushException as error:
            if error.response is not None and error.response.status_code in (404, 410):
                raise SubscriptionGoneError from error
            raise
