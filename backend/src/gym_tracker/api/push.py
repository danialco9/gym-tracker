"""Notifications on the lock screen when a rest between sets is over."""

from __future__ import annotations

import time
import uuid
from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select, update

from gym_tracker.api.deps import CurrentUser, RateLimiterDep, SessionDep, SettingsDep
from gym_tracker.models import PushSubscription
from gym_tracker.push import Pusher, PushTarget, SubscriptionGoneError, WebPusher
from gym_tracker.rate_limit import REST_PUSH_PER_USER, Check
from gym_tracker.schemas import PushKeyRead, PushSubscriptionIn, RestPushIn

router = APIRouter(prefix="/push", tags=["push"])

NOT_CONFIGURED = "Notifications are not configured"
REST_OVER_TITLE = "Descanso terminado"


def get_pusher(settings: SettingsDep) -> Pusher | None:
    if settings.vapid_private_key is None:
        return None
    return WebPusher(settings.vapid_private_key.get_secret_value(), subject=settings.app_url)


def get_sleep() -> Callable[[float], None]:
    """Waits out the rest; tests swap it for one that returns at once."""
    return time.sleep


PusherDep = Annotated[Pusher | None, Depends(get_pusher)]
SleepDep = Annotated[Callable[[float], None], Depends(get_sleep)]


def _own_subscription(session: SessionDep, user_id: int, endpoint: str) -> PushSubscription:
    subscription = session.scalar(
        select(PushSubscription).where(PushSubscription.endpoint == endpoint, PushSubscription.user_id == user_id)
    )
    if subscription is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unknown device")
    return subscription


@router.get("/public-key")
def read_public_key(settings: SettingsDep) -> PushKeyRead:
    """The key the browser subscribes with; 404 while the server has none, so the app offers nothing."""
    if settings.vapid_public_key is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_CONFIGURED)
    return PushKeyRead(public_key=settings.vapid_public_key)


@router.put("/subscription", status_code=status.HTTP_204_NO_CONTENT)
def save_subscription(payload: PushSubscriptionIn, session: SessionDep, user: CurrentUser) -> None:
    """Remember this device. Subscribing again (new keys, or another account on the phone) updates it."""
    subscription = session.scalar(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    if subscription is None:
        subscription = PushSubscription(endpoint=payload.endpoint)
        session.add(subscription)
    subscription.user_id = user.id
    subscription.p256dh = payload.keys.p256dh
    subscription.auth = payload.keys.auth
    session.commit()


@router.delete("/subscription", status_code=status.HTTP_204_NO_CONTENT)
def delete_subscription(endpoint: str, session: SessionDep, user: CurrentUser) -> None:
    session.execute(
        delete(PushSubscription).where(PushSubscription.endpoint == endpoint, PushSubscription.user_id == user.id)
    )
    session.commit()


@router.post("/rest", status_code=status.HTTP_204_NO_CONTENT)
def notify_when_rest_ends(
    payload: RestPushIn,
    *,
    session: SessionDep,
    user: CurrentUser,
    limiter: RateLimiterDep,
    pusher: PusherDep,
    sleep: SleepDep,
) -> None:
    """Answer when the rest is over, after sending the notification unless the rest changed meanwhile.

    The phone does not wait for the answer: it is locked by then. Any new rest on the device (more
    time, the next set) replaces this one, and "Ya estoy listo" clears it.
    """
    if pusher is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_CONFIGURED)
    limiter.hit(Check(REST_PUSH_PER_USER, ("rest-push", str(user.id))))
    subscription = _own_subscription(session, user.id, payload.endpoint)
    rest_id = uuid.uuid4()
    subscription.rest_id = rest_id
    subscription_id = subscription.id
    target = PushTarget(subscription.endpoint, subscription.p256dh, subscription.auth)
    # Committing hands the connection back to the pool, so none is held while waiting.
    session.commit()

    sleep(payload.seconds)

    # Claim the rest in one statement: of two waits on the same device, at most one ever sends.
    claimed = session.scalar(
        update(PushSubscription)
        .where(PushSubscription.id == subscription_id, PushSubscription.rest_id == rest_id)
        .values(rest_id=None)
        .returning(PushSubscription.id)
    )
    session.commit()
    if claimed is None:
        return
    try:
        pusher.send(target, {"title": REST_OVER_TITLE, "body": payload.body, "url": "/entrenar"})
    except SubscriptionGoneError:
        session.execute(delete(PushSubscription).where(PushSubscription.id == subscription_id))
        session.commit()


@router.delete("/rest", status_code=status.HTTP_204_NO_CONTENT)
def cancel_rest(endpoint: str, session: SessionDep, user: CurrentUser) -> None:
    """Back to training before the rest is over: the waiting request finds nothing to send."""
    _own_subscription(session, user.id, endpoint).rest_id = None
    session.commit()
