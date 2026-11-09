from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from gym_tracker.api.deps import get_today
from gym_tracker.demo import DEMO_EMAIL, DEMO_PASSWORD, ROUTINES, seed_demo
from gym_tracker.models import Routine, User, Workout

TODAY = date(2026, 9, 16)


def test_seed_demo_creates_a_realistic_account(client: TestClient, session: Session) -> None:
    summary = seed_demo(session, weeks=6, today=TODAY)

    assert summary.workouts > 15
    assert summary.measurements > 20
    assert set(session.scalars(select(Routine.name).where(Routine.user_id == summary.user.id))) == set(ROUTINES)
    latest = session.scalar(select(func.max(Workout.started_at)).where(Workout.user_id == summary.user.id))
    assert latest is not None
    assert latest.date() < TODAY

    login = client.post("/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert login.status_code == 204
    client.app.dependency_overrides[get_today] = lambda: TODAY  # type: ignore[attr-defined]
    overview = client.get("/api/progress/overview").json()

    lifts = sum(len(lifts) for lifts in ROUTINES.values())
    assert len(overview["recommendations"]) == lifts
    assert len({item["action"] for item in overview["recommendations"]}) > 1
    assert overview["body_weight"]["weekly_change_kg"] < 0


def test_seed_demo_is_repeatable(session: Session) -> None:
    first = seed_demo(session, weeks=2, today=TODAY)
    second = seed_demo(session, weeks=2, today=TODAY)

    assert session.scalar(select(func.count()).select_from(User).where(User.email == DEMO_EMAIL)) == 1
    assert (first.workouts, first.measurements) == (second.workouts, second.measurements)
    assert session.scalar(select(func.count()).select_from(Workout).where(Workout.user_id == first.user.id)) == 0
