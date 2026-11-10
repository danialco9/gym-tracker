from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from gym_tracker.analysis.strength import Standard, estimated_percentile
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
) -> User:
    """A user with a body weight and one set per ``(slug, reps, weight)``."""
    if user is None:
        user = create_user(session, email=email, password="another-password")
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
def me(session: Session, user: User) -> User:
    """Me: 80 kg now (90 kg before), with a bench press of 5 x 100 kg."""
    session.add(BodyMeasurement(user_id=user.id, measured_on=date(2026, 8, 1), weight_kg=Decimal(90)))
    return add_lifter(session, user, body_weight=80, lifts=[("bench-press", 5, 100)])


def my_ranking(client: TestClient) -> dict[str, Any]:
    ranking: dict[str, Any] = client.get("/api/ranking/zones").json()
    return ranking


def my_lift(client: TestClient, exercise_id: int) -> dict[str, Any]:
    lift: dict[str, Any] = next(lift for lift in my_ranking(client)["lifts"] if lift["exercise"]["id"] == exercise_id)
    return lift


def test_my_ranking_has_every_zone_and_my_lifts_with_their_sets(
    auth_client: TestClient, session: Session, me: User
) -> None:
    bench = catalog_exercise_id(session, "bench-press")

    ranking = my_ranking(auth_client)

    assert me.sex is None

    # With no sex set, compared with men and women together.
    mine = estimated_percentile(MY_BENCH_MAX, 80, BENCH, None)
    assert ranking == {
        "needs_body_weight": False,
        "zones": [
            {
                "zone": "chest",
                "tier": "ruby",
                "progress": pytest.approx((mine - 0.94) / 0.04),
                "percentile": pytest.approx(mine * 100, abs=0.05),
            },
            *(
                {"zone": zone, "tier": None, "progress": None, "percentile": None}
                for zone in ("back", "shoulders", "arms", "legs", "core")
            ),
        ],
        "lifts": [
            {
                "exercise": {"id": bench, "name": "Press banca con barra"},
                "zone": "chest",
                "tier": "ruby",
                "progress": pytest.approx((mine - 0.94) / 0.04),
                "percentile": pytest.approx(mine * 100, abs=0.05),
                "weight_kg": 100,
                "reps": 5,
            }
        ],
    }


def test_without_a_body_weight_there_is_no_tier(auth_client: TestClient, session: Session, user: User) -> None:
    add_lifter(session, user, body_weight=None, lifts=[("bench-press", 5, 100)])

    ranking = my_ranking(auth_client)

    assert ranking["needs_body_weight"] is True
    assert ranking["lifts"] == []
    assert all(zone["tier"] is None and zone["percentile"] is None for zone in ranking["zones"])


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
    lift = my_lift(auth_client, bench)
    assert lift["tier"] == "emerald"
    assert (lift["weight_kg"], lift["reps"]) == (70, 12)


def test_unranked_exercises_are_left_out(auth_client: TestClient, session: Session, user: User) -> None:
    add_lifter(session, user, body_weight=80, lifts=[("assisted-pull-up-machine", 8, 30), ("crunch", 20, 0)])

    ranking = my_ranking(auth_client)

    assert ranking["lifts"] == []
    assert all(zone["tier"] is None for zone in ranking["zones"])


def test_pull_ups_count_the_body_with_the_added_weight(auth_client: TestClient, session: Session, user: User) -> None:
    pull_up = catalog_exercise_id(session, "pull-up")
    add_lifter(session, user, body_weight=80, lifts=[("pull-up", 1, 14)])
    user.sex = "male"
    session.flush()

    # A man of 80 kg who adds 14 kg is the typical one; the set shows the added weight only.
    lift = my_lift(auth_client, pull_up)
    assert lift["percentile"] == pytest.approx(50, abs=0.05)
    assert lift["weight_kg"] == 14


def test_a_zone_is_the_mean_of_its_exercises(auth_client: TestClient, session: Session, user: User) -> None:
    # 60 kg x 5 on the leg press and on the squat, at 80 kg.
    add_lifter(session, user, body_weight=80, lifts=[("leg-press", 5, 60), ("back-squat", 5, 60)])
    max_kg = 60 * (1 + 5 / 30)
    expected = (
        estimated_percentile(max_kg, 80, Standard("leg-press", 1.0), None)
        + estimated_percentile(max_kg, 80, Standard("back-squat", 1.0), None)
    ) / 2

    legs = next(zone for zone in my_ranking(auth_client)["zones"] if zone["zone"] == "legs")

    assert legs["percentile"] == pytest.approx(expected * 100, abs=0.05)


def test_a_lift_is_compared_with_the_same_sex(auth_client: TestClient, session: Session, me: User) -> None:
    bench = catalog_exercise_id(session, "bench-press")
    me.sex = "male"
    session.flush()

    percentile = my_lift(auth_client, bench)["percentile"]

    assert percentile == pytest.approx(estimated_percentile(MY_BENCH_MAX, 80, BENCH, Sex.MALE) * 100, abs=0.05)
    assert percentile < estimated_percentile(MY_BENCH_MAX, 80, BENCH, None) * 100


def test_the_app_other_lifters_do_not_move_my_ranking(auth_client: TestClient, session: Session, me: User) -> None:
    alone = my_ranking(auth_client)

    # However many of the app's users bench less or more, I am compared with gym-goers at large.
    for index in range(40):
        add_lifter(
            session,
            None,
            email=f"lifter{index}@example.com",
            body_weight=80,
            lifts=[("bench-press", 1, 40 + 5 * index)],
        )

    assert my_ranking(auth_client) == alone


def test_the_same_lift_ranks_higher_at_a_lower_body_weight(
    auth_client: TestClient, session: Session, user: User
) -> None:
    bench = catalog_exercise_id(session, "bench-press")
    add_lifter(session, user, body_weight=80, lifts=[("bench-press", 1, 50)])
    heavy = my_lift(auth_client, bench)["percentile"]

    session.add(BodyMeasurement(user_id=user.id, measured_on=date(2026, 9, 10), weight_kg=Decimal(50)))
    session.flush()
    light = my_lift(auth_client, bench)["percentile"]

    assert heavy < 50 < light


def test_nobody_else_is_listed(auth_client: TestClient) -> None:
    # The lists of lifters, per zone and per exercise, are gone.
    assert auth_client.get("/api/ranking/zones/chest").status_code == 404
    assert auth_client.get("/api/ranking/exercises/1").status_code == 404


def test_the_ranking_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/ranking/zones").status_code == 401
