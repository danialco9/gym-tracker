from collections.abc import Iterator
from typing import Any, cast

import pytest
import sentry_sdk
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sentry_sdk.envelope import Envelope
from sentry_sdk.transport import Transport

from gym_tracker.error_reporting import init_error_reporting


class CapturedEvents(Transport):
    """Keeps the error events in memory instead of sending them to Sentry."""

    def __init__(self) -> None:
        super().__init__()
        self.events: list[dict[str, Any]] = []

    def capture_envelope(self, envelope: Envelope) -> None:
        self.events.extend(
            cast("dict[str, Any]", event) for item in envelope.items if (event := item.get_event()) is not None
        )


@pytest.fixture
def captured(monkeypatch: pytest.MonkeyPatch) -> Iterator[CapturedEvents]:
    transport = CapturedEvents()
    real_init = sentry_sdk.init
    monkeypatch.setattr(sentry_sdk, "init", lambda **options: real_init(transport=transport, **options))
    yield transport
    sentry_sdk.get_client().close()
    real_init()  # back to a client with no DSN, so no other test reports anything


def failing_app() -> FastAPI:
    app = FastAPI()

    @app.post("/workouts")
    def save_workout() -> None:
        weight_kg = 140  # a local variable of the failing code, which must not travel either
        raise RuntimeError(f"could not save the set of {weight_kg} kg")

    return app


def test_nothing_is_reported_without_a_dsn() -> None:
    assert init_error_reporting(None) is False
    assert init_error_reporting("") is False


def test_an_unhandled_error_is_reported_without_personal_data(
    captured: CapturedEvents, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("VERCEL_ENV", "preview")
    monkeypatch.setenv("VERCEL_GIT_COMMIT_SHA", "abc1234")
    assert init_error_reporting("https://public@sentry.example.invalid/1") is True

    client = TestClient(failing_app(), raise_server_exceptions=False, cookies={"session": "a-session-token"})
    response = client.post(
        "/workouts?email=dani@example.com",
        json={"password": "secreto-123", "weight_kg": 140},
        headers={"user-agent": "Mozilla/5.0 (iPhone)", "authorization": "Bearer a-token"},
    )
    sentry_sdk.flush()

    assert response.status_code == 500
    [event] = captured.events
    assert event["environment"] == "preview"
    assert event["release"] == "abc1234"
    assert event["exception"]["values"][0]["type"] == "RuntimeError"

    request = event["request"]
    # Only the allowed headers keep their value; the rest, the token and the cookie among them, do not.
    headers = request["headers"]
    assert headers["user-agent"] == "Mozilla/5.0 (iPhone)"
    assert headers["authorization"] == "[Filtered]"
    assert headers["cookie"] == "[Filtered]"
    assert all(value == "[Filtered]" for name, value in headers.items() if name not in {"user-agent", "content-type"})
    assert not request.get("cookies")
    assert not request.get("data")
    assert not request.get("query_string")
    assert "user" not in event
    frames = event["exception"]["values"][0]["stacktrace"]["frames"]
    assert all("vars" not in frame for frame in frames)
