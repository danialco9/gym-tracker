import uuid
from collections.abc import Callable

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from gym_tracker.api.push import get_pusher, get_sleep
from gym_tracker.config import Settings
from gym_tracker.models import PushSubscription, User
from gym_tracker.push import PushTarget, SubscriptionGoneError
from gym_tracker.users import create_user

ENDPOINT = "https://web.push.apple.com/QGuQyavXutnMH2"
SUBSCRIPTION = {"endpoint": ENDPOINT, "keys": {"p256dh": "BPh4-public-key", "auth": "auth-secret"}}
REST = {"endpoint": ENDPOINT, "seconds": 90, "body": "Press banca · serie 2 · 8 x 80 kg"}


class FakePusher:
    def __init__(self, error: Exception | None = None) -> None:
        self.sent: list[tuple[PushTarget, dict[str, str]]] = []
        self._error = error

    def send(self, target: PushTarget, message: dict[str, str]) -> None:
        if self._error is not None:
            raise self._error
        self.sent.append((target, message))


def app_of(client: TestClient) -> FastAPI:
    app = client.app
    assert isinstance(app, FastAPI)
    return app


@pytest.fixture
def pusher(auth_client: TestClient) -> FakePusher:
    fake = FakePusher()
    app_of(auth_client).dependency_overrides[get_pusher] = lambda: fake
    return fake


@pytest.fixture
def waits(auth_client: TestClient) -> list[float]:
    """The rests the server waited out, without waiting."""
    seconds: list[float] = []
    app_of(auth_client).dependency_overrides[get_sleep] = lambda: seconds.append
    return seconds


def during_rest(auth_client: TestClient, action: Callable[[], None]) -> None:
    """Runs ``action`` while the server waits, as if the phone did something mid-rest."""
    app_of(auth_client).dependency_overrides[get_sleep] = lambda: lambda _seconds: action()


def subscriptions(session: Session) -> list[PushSubscription]:
    return list(session.scalars(select(PushSubscription).order_by(PushSubscription.id)))


def test_offers_the_public_key_only_when_configured(client: TestClient, settings: Settings) -> None:
    assert client.get("/api/push/public-key").status_code == 404

    settings.vapid_public_key = "BPublicKey"

    assert client.get("/api/push/public-key").json() == {"public_key": "BPublicKey"}


def test_remembers_a_device_once_and_updates_its_keys(auth_client: TestClient, session: Session, user: User) -> None:
    assert auth_client.put("/api/push/subscription", json=SUBSCRIPTION).status_code == 204
    renewed = {**SUBSCRIPTION, "keys": {"p256dh": "BNew-public-key", "auth": "new-secret"}}
    assert auth_client.put("/api/push/subscription", json=renewed).status_code == 204

    [device] = subscriptions(session)
    assert (device.user_id, device.endpoint, device.p256dh, device.auth) == (
        user.id,
        ENDPOINT,
        "BNew-public-key",
        "new-secret",
    )


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://web.push.apple.com/x",
        "https://localhost/x",
        "https://evil.example/push.apple.com",
        "https://apple.com/x",
    ],
)
def test_only_accepts_push_service_endpoints(auth_client: TestClient, session: Session, endpoint: str) -> None:
    response = auth_client.put("/api/push/subscription", json={**SUBSCRIPTION, "endpoint": endpoint})

    assert response.status_code == 422
    assert subscriptions(session) == []


def test_forgets_a_device(auth_client: TestClient, session: Session) -> None:
    auth_client.put("/api/push/subscription", json=SUBSCRIPTION)

    assert auth_client.delete("/api/push/subscription", params={"endpoint": ENDPOINT}).status_code == 204
    assert subscriptions(session) == []


def test_requires_a_session(client: TestClient) -> None:
    assert client.put("/api/push/subscription", json=SUBSCRIPTION).status_code == 401
    assert client.post("/api/push/rest", json=REST).status_code == 401


def test_notifies_when_the_rest_is_over(auth_client: TestClient, pusher: FakePusher, waits: list[float]) -> None:
    auth_client.put("/api/push/subscription", json=SUBSCRIPTION)

    assert auth_client.post("/api/push/rest", json=REST).status_code == 204

    assert waits == [90]
    assert pusher.sent == [
        (
            PushTarget(ENDPOINT, "BPh4-public-key", "auth-secret"),
            {"title": "Descanso terminado", "body": "Press banca · serie 2 · 8 x 80 kg", "url": "/entrenar"},
        )
    ]


def test_sends_nothing_when_the_rest_changed_meanwhile(
    auth_client: TestClient, session: Session, pusher: FakePusher
) -> None:
    auth_client.put("/api/push/subscription", json=SUBSCRIPTION)
    [device] = subscriptions(session)

    def newer_rest() -> None:
        device.rest_id = uuid.uuid4()
        session.commit()

    during_rest(auth_client, newer_rest)
    auth_client.post("/api/push/rest", json=REST)

    assert pusher.sent == []


def test_sends_nothing_when_back_to_training_early(
    auth_client: TestClient, session: Session, pusher: FakePusher
) -> None:
    auth_client.put("/api/push/subscription", json=SUBSCRIPTION)

    during_rest(auth_client, lambda: auth_client.delete("/api/push/rest", params={"endpoint": ENDPOINT}))
    auth_client.post("/api/push/rest", json=REST)

    assert pusher.sent == []
    assert [device.rest_id for device in subscriptions(session)] == [None]


def test_forgets_a_device_its_push_service_no_longer_knows(
    auth_client: TestClient, session: Session, waits: list[float]
) -> None:
    app_of(auth_client).dependency_overrides[get_pusher] = lambda: FakePusher(SubscriptionGoneError())
    auth_client.put("/api/push/subscription", json=SUBSCRIPTION)

    assert auth_client.post("/api/push/rest", json=REST).status_code == 204
    assert subscriptions(session) == []


def test_only_times_rests_for_your_own_devices(
    auth_client: TestClient, session: Session, pusher: FakePusher, waits: list[float]
) -> None:
    other = create_user(session, email="other@example.com", password="another-long-password")
    session.add(PushSubscription(user_id=other.id, endpoint=ENDPOINT, p256dh="k", auth="a"))
    session.commit()

    assert auth_client.post("/api/push/rest", json=REST).status_code == 404
    assert auth_client.delete("/api/push/rest", params={"endpoint": ENDPOINT}).status_code == 404
    assert pusher.sent == []
    assert waits == []


@pytest.mark.parametrize("seconds", [0, 291])
def test_rejects_rests_it_cannot_wait_out(
    auth_client: TestClient, pusher: FakePusher, waits: list[float], seconds: int
) -> None:
    auth_client.put("/api/push/subscription", json=SUBSCRIPTION)

    assert auth_client.post("/api/push/rest", json={**REST, "seconds": seconds}).status_code == 422
    assert waits == []


def test_says_so_when_notifications_are_not_configured(auth_client: TestClient, settings: Settings) -> None:
    auth_client.put("/api/push/subscription", json=SUBSCRIPTION)

    assert settings.vapid_private_key is None
    assert auth_client.post("/api/push/rest", json=REST).status_code == 404
