from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from gym_tracker.analysis.strength import MIN_APP_LIFTERS, Zone, estimated_percentile
from gym_tracker.config import Settings
from gym_tracker.enums import Sex
from gym_tracker.models import BodyMeasurement, User, Workout, WorkoutSet
from gym_tracker.users import create_user
from tests.api.conftest import catalog_exercise_id

pytestmark = pytest.mark.usefixtures("catalog")

# My bench press in the fixture: 5 x 100 kg at 80 kg of body weight, against a 2.0 scale.
MY_BENCH_RATIO = 100 * (1 + 5 / 30) / 80


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

    # Overall scores: a fifth of each one's only percentile, as the other four count as zero.
    assert ranking["entries"] == [
        {"position": 1, "name": "Tigre", "tier": "bronze", "is_me": False},
        {"position": 2, "name": f"Atleta {lifters['me'].id}", "tier": "bronze", "is_me": True},
        {"position": 3, "name": f"Atleta {lifters['unnamed'].id}", "tier": "bronze", "is_me": False},
    ]
    assert ranking["me"] == {
        "tier": "bronze",
        "progress": pytest.approx(estimated_percentile(MY_BENCH_RATIO, 2.0, Zone.CHEST, None) / 5 / 0.20),
        "percentile": pytest.approx(estimated_percentile(MY_BENCH_RATIO, 2.0, Zone.CHEST, None) * 100 / 5, abs=0.05),
        "source": None,
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
        (f"Atleta {lifters['me'].id}", "ruby"),
    ]
    # With no sex set, compared with men and women together.
    mine = estimated_percentile(MY_BENCH_RATIO, 2.0, Zone.CHEST, None)
    assert ranking["me"]["tier"] == "ruby"
    assert ranking["me"]["progress"] == pytest.approx((mine - 0.94) / 0.04)
    assert ranking["me"]["percentile"] == pytest.approx(mine * 100, abs=0.05)
    assert ranking["me"]["source"] == "estimate"


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

    assert me == {
        "tier": None,
        "progress": None,
        "percentile": None,
        "source": None,
        "position": None,
        "needs_body_weight": True,
        "show_in_ranking": True,
    }


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

    # 40 reps count as 12: 70 kg x 1.4 = 98 kg, 1.2x body weight, about the 89th percentile.
    assert auth_client.get(f"/api/ranking/exercises/{bench}").json()["me"]["tier"] == "emerald"


@pytest.mark.parametrize("slug", ["assisted-pull-up-machine", "crunch"])
def test_unranked_exercises_have_no_ranking(auth_client: TestClient, session: Session, slug: str) -> None:
    exercise = catalog_exercise_id(session, slug)

    assert auth_client.get(f"/api/ranking/exercises/{exercise}").status_code == 404


def test_my_ranking_has_every_zone_and_my_lifts_with_their_sets(
    auth_client: TestClient, session: Session, lifters: dict[str, User]
) -> None:
    bench = catalog_exercise_id(session, "bench-press")

    ranking = auth_client.get("/api/ranking/zones").json()

    mine = estimated_percentile(MY_BENCH_RATIO, 2.0, Zone.CHEST, None)
    assert [zone["zone"] for zone in ranking["zones"]] == ["chest", "back", "shoulders", "arms", "legs", "core"]
    assert ranking["zones"][0] == {
        "zone": "chest",
        "tier": "ruby",
        "progress": pytest.approx((mine - 0.94) / 0.04),
        "percentile": pytest.approx(mine * 100, abs=0.05),
    }
    assert all(zone["tier"] is None and zone["percentile"] is None for zone in ranking["zones"][1:])
    assert ranking["lifts"] == [
        {
            "exercise": {"id": bench, "name": "Press banca con barra"},
            "zone": "chest",
            "tier": "ruby",
            "progress": pytest.approx((mine - 0.94) / 0.04),
            "percentile": pytest.approx(mine * 100, abs=0.05),
            "source": "estimate",
            "weight_kg": 100,
            "reps": 5,
        }
    ]
    assert ranking["needs_body_weight"] is False


def test_a_zone_is_the_mean_of_its_exercises(auth_client: TestClient, session: Session, user: User) -> None:
    # 60 kg x 5 on the leg press (scale 6.0) and on the squat (scale 2.75), at 80 kg.
    add_lifter(session, user, body_weight=80, lifts=[("leg-press", 5, 60), ("back-squat", 5, 60)])
    ratio = 60 * (1 + 5 / 30) / 80
    expected = (
        estimated_percentile(ratio, 6.0, Zone.LEGS, None) + estimated_percentile(ratio, 2.75, Zone.LEGS, None)
    ) / 2

    legs = next(zone for zone in auth_client.get("/api/ranking/zones").json()["zones"] if zone["zone"] == "legs")

    assert legs["percentile"] == pytest.approx(expected * 100, abs=0.05)


def test_a_zone_ranking_lists_only_who_lifted_in_it(
    auth_client: TestClient, session: Session, lifters: dict[str, User]
) -> None:
    chest = auth_client.get("/api/ranking/zones/chest").json()
    back = auth_client.get("/api/ranking/zones/back").json()

    assert [entry["name"] for entry in chest["entries"]] == ["Tigre", f"Atleta {lifters['me'].id}"]
    assert [exercise["name"] for exercise in chest["exercises"]] == ["Press banca con barra"]
    assert chest["me"]["position"] == 2
    assert [entry["name"] for entry in back["entries"]] == [f"Atleta {lifters['unnamed'].id}"]
    assert [exercise["name"] for exercise in back["exercises"]] == ["Dominadas"]
    assert back["me"]["tier"] is None


def test_an_unknown_zone_is_rejected(auth_client: TestClient) -> None:
    assert auth_client.get("/api/ranking/zones/neck").status_code == 422


def test_a_lift_is_compared_with_the_same_sex(
    auth_client: TestClient, session: Session, lifters: dict[str, User]
) -> None:
    bench = catalog_exercise_id(session, "bench-press")
    lifters["me"].sex = "male"
    session.flush()

    me = auth_client.get(f"/api/ranking/exercises/{bench}").json()["me"]

    assert me["percentile"] == pytest.approx(
        estimated_percentile(MY_BENCH_RATIO, 2.0, Zone.CHEST, Sex.MALE) * 100, abs=0.05
    )
    assert me["percentile"] < estimated_percentile(MY_BENCH_RATIO, 2.0, Zone.CHEST, None) * 100


def test_enough_app_lifters_replace_the_estimate(auth_client: TestClient, session: Session, user: User) -> None:
    bench = catalog_exercise_id(session, "bench-press")
    add_lifter(session, user, body_weight=80, lifts=[("bench-press", 1, 100)])
    user.sex = "male"
    # 30 other men at 80 kg, all benching less than my 100 kg; a hidden man and a woman benching
    # more are not among the ones I am compared with.
    for index in range(MIN_APP_LIFTERS):
        other = add_lifter(
            session, None, email=f"man{index}@example.com", body_weight=80, lifts=[("bench-press", 1, 61 + index)]
        )
        other.sex = "male"
    hidden = add_lifter(session, None, email="hidden@example.com", body_weight=80, lifts=[("bench-press", 1, 200)])
    hidden.show_in_ranking = False
    hidden.sex = "male"
    woman = add_lifter(session, None, email="woman@example.com", body_weight=80, lifts=[("bench-press", 1, 200)])
    woman.sex = "female"
    session.flush()

    me = auth_client.get(f"/api/ranking/exercises/{bench}").json()["me"]

    assert me["source"] == "app"
    assert me["percentile"] == 100
    assert me["tier"] == "master"


def test_too_few_app_lifters_keep_the_estimate(auth_client: TestClient, session: Session, user: User) -> None:
    bench = catalog_exercise_id(session, "bench-press")
    add_lifter(session, user, body_weight=80, lifts=[("bench-press", 1, 100)])
    for index in range(MIN_APP_LIFTERS - 1):
        add_lifter(session, None, email=f"man{index}@example.com", body_weight=80, lifts=[("bench-press", 1, 61)])

    assert auth_client.get(f"/api/ranking/exercises/{bench}").json()["me"]["source"] == "estimate"


def test_the_ranking_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/ranking").status_code == 401
