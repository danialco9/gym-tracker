from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from gym_tracker.analysis.strength import Standard, estimated_percentile
from gym_tracker.config import Settings
from gym_tracker.enums import Sex
from gym_tracker.models import BodyMeasurement, User, Workout, WorkoutSet
from gym_tracker.users import create_user
from tests.api.conftest import catalog_exercise_id

pytestmark = pytest.mark.usefixtures("catalog")

# My bench press in the fixture: 5 x 100 kg at 80 kg of body weight.
MY_BENCH_MAX = 100 * (1 + 5 / 30)
BENCH = Standard("bench-press", 1.0)


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


def test_a_zone_ranking_lists_tiers_without_kilos(auth_client: TestClient, lifters: dict[str, User]) -> None:
    ranking = auth_client.get("/api/ranking/zones/chest").json()

    # The hidden lifter, the one without a body weight and the demo are left off.
    assert ranking["entries"] == [
        {"position": 1, "name": "Tigre", "tier": "master", "is_me": False},
        {"position": 2, "name": f"Atleta {lifters['me'].id}", "tier": "ruby", "is_me": True},
    ]
    mine = estimated_percentile(MY_BENCH_MAX, 80, BENCH, None)
    assert ranking["me"] == {
        "tier": "ruby",
        "progress": pytest.approx((mine - 0.94) / 0.04),
        "percentile": pytest.approx(mine * 100, abs=0.05),
        "source": None,
        "position": 2,
        "needs_body_weight": False,
        "show_in_ranking": True,
    }


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
    mine = estimated_percentile(MY_BENCH_MAX, 80, BENCH, None)
    assert ranking["me"]["tier"] == "ruby"
    assert ranking["me"]["progress"] == pytest.approx((mine - 0.94) / 0.04)
    assert ranking["me"]["percentile"] == pytest.approx(mine * 100, abs=0.05)
    assert ranking["me"]["source"] == "estimate"


def test_hidden_users_keep_their_own_tier(auth_client: TestClient, session: Session, lifters: dict[str, User]) -> None:
    lifters["me"].show_in_ranking = False
    session.flush()

    ranking = auth_client.get("/api/ranking/zones/chest").json()

    assert all(not entry["is_me"] for entry in ranking["entries"])
    assert ranking["me"]["tier"] == "ruby"
    assert ranking["me"]["position"] is None
    assert ranking["me"]["show_in_ranking"] is False


def test_without_a_body_weight_there_is_no_tier(auth_client: TestClient, session: Session, user: User) -> None:
    add_lifter(session, user, body_weight=None, lifts=[("bench-press", 5, 100)])

    me = auth_client.get("/api/ranking/zones/chest").json()["me"]

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

    # 40 reps count as 12: 70 kg x 1.4 = 98 kg, which beats 80 % of men of 80 kg and more women.
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

    mine = estimated_percentile(MY_BENCH_MAX, 80, BENCH, None)
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
    # 60 kg x 5 on the leg press and on the squat, at 80 kg.
    add_lifter(session, user, body_weight=80, lifts=[("leg-press", 5, 60), ("back-squat", 5, 60)])
    max_kg = 60 * (1 + 5 / 30)
    expected = (
        estimated_percentile(max_kg, 80, Standard("leg-press", 1.0), None)
        + estimated_percentile(max_kg, 80, Standard("back-squat", 1.0), None)
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

    assert me["percentile"] == pytest.approx(estimated_percentile(MY_BENCH_MAX, 80, BENCH, Sex.MALE) * 100, abs=0.05)
    assert me["percentile"] < estimated_percentile(MY_BENCH_MAX, 80, BENCH, None) * 100


def test_the_app_other_lifters_do_not_move_my_percentile(auth_client: TestClient, session: Session, user: User) -> None:
    bench = catalog_exercise_id(session, "bench-press")
    add_lifter(session, user, body_weight=80, lifts=[("bench-press", 1, 100)])
    alone = auth_client.get(f"/api/ranking/exercises/{bench}").json()["me"]

    # However many of the app's users bench less, I am still compared with gym-goers at large.
    for index in range(40):
        add_lifter(session, None, email=f"man{index}@example.com", body_weight=80, lifts=[("bench-press", 1, 61)])
    among_many = auth_client.get(f"/api/ranking/exercises/{bench}").json()["me"]

    assert among_many["percentile"] == alone["percentile"]
    assert among_many["source"] == "estimate"


def test_the_same_lift_ranks_higher_at_a_lower_body_weight(
    auth_client: TestClient, session: Session, user: User
) -> None:
    bench = catalog_exercise_id(session, "bench-press")
    add_lifter(session, user, body_weight=80, lifts=[("bench-press", 1, 50)])
    heavy = auth_client.get(f"/api/ranking/exercises/{bench}").json()["me"]["percentile"]

    session.add(BodyMeasurement(user_id=user.id, measured_on=date(2026, 9, 10), weight_kg=Decimal(50)))
    session.flush()
    light = auth_client.get(f"/api/ranking/exercises/{bench}").json()["me"]["percentile"]

    assert heavy < 50 < light


def test_the_ranking_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/ranking/zones").status_code == 401
    assert client.get("/api/ranking/zones/chest").status_code == 401
