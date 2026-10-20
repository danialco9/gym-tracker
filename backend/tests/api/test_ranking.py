from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from gym_tracker.config import Settings
from gym_tracker.models import BodyMeasurement, User, Workout, WorkoutSet
from gym_tracker.users import create_user
from tests.api.conftest import catalog_exercise_id

pytestmark = pytest.mark.usefixtures("catalog")


def add_lifter(
    session: Session,
    user: User | None,
    *,
    email: str = "",
    body_weight: float | None,
    lifts: list[tuple[str, int, float]],
    nickname: str | None = None,
    show_in_ranking: bool = True,
) -> User:
    """A user with a body weight and one set per ``(slug, reps, weight)``."""
    if user is None:
        user = create_user(session, email=email, password="another-password")
    user.nickname = nickname
    user.show_in_ranking = show_in_ranking
    if body_weight is not None:
        session.add(BodyMeasurement(user_id=user.id, measured_on=date(2026, 9, 1), weight_kg=Decimal(body_weight)))
    session.add(
        Workout(
            user_id=user.id,
            started_at=datetime(2026, 9, 15, 16, tzinfo=UTC),
            sets=[
                WorkoutSet(
                    exercise_id=catalog_exercise_id(session, slug),
                    set_number=number,
                    reps=reps,
                    weight_kg=Decimal(weight),
                )
                for number, (slug, reps, weight) in enumerate(lifts, start=1)
            ],
        )
    )
    session.flush()
    return user


@pytest.fixture
def lifters(session: Session, user: User, settings: Settings) -> dict[str, User]:
    """Me (80 kg, bench 5x100), a stronger "Tigre", an unnamed one, a hidden one, one without weight and the demo."""
    session.add(BodyMeasurement(user_id=user.id, measured_on=date(2026, 8, 1), weight_kg=Decimal(90)))
    me = add_lifter(session, user, body_weight=80, lifts=[("bench-press", 5, 100)])
    return {
        "me": me,
        "tigre": add_lifter(
            session, None, email="tigre@example.com", nickname="Tigre", body_weight=100, lifts=[("bench-press", 1, 200)]
        ),
        "unnamed": add_lifter(session, None, email="unnamed@example.com", body_weight=60, lifts=[("pull-up", 10, 0)]),
        "hidden": add_lifter(
            session,
            None,
            email="hidden@example.com",
            nickname="Oculto",
            show_in_ranking=False,
            body_weight=70,
            lifts=[("bench-press", 1, 200)],
        ),
        "weightless": add_lifter(session, None, email="weightless@example.com", body_weight=None, lifts=[]),
        "demo": add_lifter(session, None, email=settings.demo_email, body_weight=70, lifts=[("bench-press", 1, 200)]),
    }


def test_the_overall_ranking_lists_tiers_without_kilos(auth_client: TestClient, lifters: dict[str, User]) -> None:
    ranking = auth_client.get("/api/ranking").json()

    # Overall scores: Tigre 1.0 / 5, me (116.7 kg / 80 kg) / 2.0 / 5, the pull-ups (80 kg / 60 kg) / 2.0 / 5.
    assert ranking["entries"] == [
        {"position": 1, "name": "Tigre", "tier": "bronze", "is_me": False},
        {"position": 2, "name": f"Atleta {lifters['me'].id}", "tier": "bronze", "is_me": True},
        {"position": 3, "name": f"Atleta {lifters['unnamed'].id}", "tier": "bronze", "is_me": False},
    ]
    assert ranking["me"] == {
        "tier": "bronze",
        "progress": pytest.approx((100 * (1 + 5 / 30) / 80 / 2.0 / 5) / 0.25),
        "position": 2,
        "needs_body_weight": False,
        "show_in_ranking": True,
    }
    assert [exercise["name"] for exercise in ranking["exercises"]] == ["Dominadas", "Press banca con barra"]


def test_an_exercise_ranking_scores_that_lift(
    auth_client: TestClient, session: Session, lifters: dict[str, User]
) -> None:
    bench = catalog_exercise_id(session, "bench-press")

    ranking = auth_client.get(f"/api/ranking/exercises/{bench}").json()

    assert ranking["exercise"] == {"id": bench, "name": "Press banca con barra"}
    assert [(entry["name"], entry["tier"]) for entry in ranking["entries"]] == [
        ("Tigre", "master"),
        (f"Atleta {lifters['me'].id}", "diamond"),
    ]
    assert ranking["me"]["tier"] == "diamond"
    assert ranking["me"]["progress"] == pytest.approx((100 * (1 + 5 / 30) / 80 / 2.0 - 0.64) / 0.12)


def test_hidden_users_keep_their_own_tier(auth_client: TestClient, session: Session, lifters: dict[str, User]) -> None:
    lifters["me"].show_in_ranking = False
    session.flush()

    ranking = auth_client.get("/api/ranking").json()

    assert all(not entry["is_me"] for entry in ranking["entries"])
    assert ranking["me"]["tier"] == "bronze"
    assert ranking["me"]["position"] is None
    assert ranking["me"]["show_in_ranking"] is False


def test_without_a_body_weight_there_is_no_tier(auth_client: TestClient, session: Session, user: User) -> None:
    add_lifter(session, user, body_weight=None, lifts=[("bench-press", 5, 100)])

    me = auth_client.get("/api/ranking").json()["me"]

    assert me == {"tier": None, "progress": None, "position": None, "needs_body_weight": True, "show_in_ranking": True}


def test_warm_ups_and_long_sets_do_not_inflate_the_tier(auth_client: TestClient, session: Session, user: User) -> None:
    bench = catalog_exercise_id(session, "bench-press")
    add_lifter(session, user, body_weight=80, lifts=[("bench-press", 40, 70)])
    session.add(
        Workout(
            user_id=user.id,
            started_at=datetime(2026, 9, 16, 16, tzinfo=UTC),
            sets=[WorkoutSet(exercise_id=bench, set_number=1, reps=1, weight_kg=Decimal(300), is_warmup=True)],
        )
    )
    session.flush()

    # 40 reps count as 12: 70 kg x 1.4 = 98 kg, 1.2x body weight, 0.61 of the 2.0 Master ratio.
    assert auth_client.get(f"/api/ranking/exercises/{bench}").json()["me"]["tier"] == "platinum"


@pytest.mark.parametrize("slug", ["assisted-pull-up-machine", "crunch"])
def test_unranked_exercises_have_no_ranking(auth_client: TestClient, session: Session, slug: str) -> None:
    exercise = catalog_exercise_id(session, slug)

    assert auth_client.get(f"/api/ranking/exercises/{exercise}").status_code == 404


def test_the_ranking_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/ranking").status_code == 401
