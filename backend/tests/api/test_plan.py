from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from gym_tracker.api.deps import get_today
from gym_tracker.models import Routine
from gym_tracker.users import create_user
from tests.api.conftest import catalog_exercise_id

pytestmark = pytest.mark.usefixtures("catalog")

# Thursday 12 November 2026; its week starts on Monday the 9th.
TODAY = date(2026, 11, 12)


@pytest.fixture
def plan_client(auth_client: TestClient) -> Iterator[TestClient]:
    auth_client.app.dependency_overrides[get_today] = lambda: TODAY  # type: ignore[attr-defined]
    yield auth_client
    auth_client.app.dependency_overrides.pop(get_today)  # type: ignore[attr-defined]


def routine(client: TestClient, session: Session, name: str) -> int:
    payload = {"name": name, "exercises": [{"exercise_id": catalog_exercise_id(session, "bench-press"), "sets": [{}]}]}
    response = client.post("/api/routines", json=payload)
    assert response.status_code == 201, response.text
    routine_id: int = response.json()["id"]
    return routine_id


def kinds(week: dict[str, object]) -> list[tuple[str, str | None]]:
    days: list[dict[str, object]] = week["days"]  # type: ignore[assignment]
    return [
        (str(day["kind"]), None if day["routine"] is None else str(day["routine"]["name"]))  # type: ignore[index]
        for day in days
    ]


def test_without_a_plan_every_day_rests(plan_client: TestClient) -> None:
    week = plan_client.get("/api/plan/week").json()

    assert (week["start"], week["today"]) == ("2026-11-09", "2026-11-12")
    assert [day["on_date"] for day in week["days"]] == [f"2026-11-{day:02}" for day in range(9, 16)]
    assert {day["kind"] for day in week["days"]} == {"rest"}


def test_the_usual_week_repeats_every_week(plan_client: TestClient, session: Session) -> None:
    upper = routine(plan_client, session, "Torso")
    response = plan_client.put("/api/plan/days", json={"days": [{"weekday": 0, "routine_id": upper}, {"weekday": 3}]})

    assert response.status_code == 200
    assert response.json() == [{"weekday": 0, "routine_id": upper}, {"weekday": 3, "routine_id": None}]
    for start in ("2026-11-12", "2027-01-06"):
        week = plan_client.get("/api/plan/week", params={"start": start}).json()
        assert kinds(week)[0] == ("routine", "Torso")
        assert kinds(week)[3] == ("free", None)
        assert week["days"][0]["routine"]["exercise_count"] == 1


def test_a_change_holds_on_its_date_only_and_can_be_undone(plan_client: TestClient, session: Session) -> None:
    upper, lower = routine(plan_client, session, "Torso"), routine(plan_client, session, "Pierna")
    plan_client.put("/api/plan/days", json={"days": [{"weekday": 0, "routine_id": upper}]})

    week = plan_client.put("/api/plan/changes/2026-11-09", json={"kind": "routine", "routine_id": lower}).json()

    assert kinds(week)[0] == ("routine", "Pierna")
    assert week["days"][0]["changed"] is True
    assert kinds(plan_client.get("/api/plan/week", params={"start": "2026-11-16"}).json())[0] == ("routine", "Torso")

    week = plan_client.put("/api/plan/changes/2026-11-09", json={"kind": "rest"}).json()
    assert kinds(week)[0] == ("rest", None)

    week = plan_client.delete("/api/plan/changes/2026-11-09").json()
    assert kinds(week)[0] == ("routine", "Torso")
    assert week["days"][0]["changed"] is False


def test_a_day_moves_to_another_and_leaves_rest(plan_client: TestClient, session: Session) -> None:
    upper = routine(plan_client, session, "Torso")
    plan_client.put("/api/plan/days", json={"days": [{"weekday": 1, "routine_id": upper}]})

    response = plan_client.post("/api/plan/move", json={"from_date": "2026-11-10", "to_date": "2026-11-12"})

    assert response.status_code == 200
    assert kinds(response.json())[1:4] == [("rest", None), ("rest", None), ("routine", "Torso")]
    # A rest day has nothing to move.
    rest = plan_client.post("/api/plan/move", json={"from_date": "2026-11-10", "to_date": "2026-11-13"})
    assert rest.status_code == 422


def test_the_week_marks_the_days_with_a_workout(plan_client: TestClient) -> None:
    # 00:30 in Madrid on Wednesday is still Tuesday in UTC: the local day counts.
    for started_at in ("2026-11-09T18:00:00+01:00", "2026-11-10T23:30:00+00:00"):
        response = plan_client.post("/api/workouts", json={"started_at": started_at, "sets": []})
        assert response.status_code == 201, response.text

    week = plan_client.get("/api/plan/week").json()

    assert [day["trained"] for day in week["days"]] == [True, False, True, False, False, False, False]


def test_the_ready_made_split_can_be_previewed_without_saving(plan_client: TestClient) -> None:
    response = plan_client.get("/api/plan/presets", params={"weekdays": [4, 0, 2]})

    assert response.status_code == 200
    preview = response.json()
    assert [(day["weekday"], day["name"]) for day in preview] == [
        (0, "Cuerpo completo A"),
        (2, "Cuerpo completo B"),
        (4, "Cuerpo completo C"),
    ]
    assert preview[0]["exercises"][0] == "Sentadilla con barra"
    assert plan_client.get("/api/routines").json() == []
    assert plan_client.get("/api/plan/presets", params={"weekdays": list(range(7))}).status_code == 422


def test_the_ready_made_split_becomes_the_usual_week(plan_client: TestClient) -> None:
    response = plan_client.post("/api/plan/presets", json={"weekdays": [0, 1, 3, 4]})

    assert response.status_code == 201
    week = plan_client.get("/api/plan/week").json()
    assert [name for _, name in kinds(week)] == ["Torso", "Pierna", None, "Torso", "Pierna", None, None]
    routines = {item["name"]: item for item in plan_client.get("/api/routines").json()}
    assert set(routines) == {"Torso", "Pierna"}
    assert routines["Pierna"]["exercises"][0]["exercise"]["slug"] == "back-squat"
    assert [planned["target_reps"] for planned in routines["Pierna"]["exercises"][0]["sets"]] == [8, 8, 8]

    # Asking again reuses the copies, even edited, instead of adding more.
    again = plan_client.post("/api/plan/presets", json={"weekdays": [0, 2, 4]})
    assert again.status_code == 201
    names = [item["name"] for item in plan_client.get("/api/routines").json()]
    assert sorted(names) == ["Cuerpo completo A", "Cuerpo completo B", "Cuerpo completo C", "Pierna", "Torso"]


@pytest.mark.parametrize(
    ("path", "payload"),
    [
        ("/api/plan/days", {"days": [{"weekday": 7}]}),
        ("/api/plan/days", {"days": [{"weekday": 1}, {"weekday": 1}]}),
        ("/api/plan/presets", {"weekdays": []}),
        ("/api/plan/presets", {"weekdays": list(range(7))}),
    ],
)
def test_weeks_are_validated(plan_client: TestClient, path: str, payload: dict[str, object]) -> None:
    method = plan_client.put if path.endswith("/days") else plan_client.post
    assert method(path, json=payload).status_code == 422


def test_a_change_needs_a_routine_for_a_routine_only(plan_client: TestClient, session: Session) -> None:
    upper = routine(plan_client, session, "Torso")

    assert plan_client.put("/api/plan/changes/2026-11-09", json={"kind": "routine"}).status_code == 422
    rest_with_routine = {"kind": "rest", "routine_id": upper}
    assert plan_client.put("/api/plan/changes/2026-11-09", json=rest_with_routine).status_code == 422


def test_routines_of_other_users_cannot_be_planned(plan_client: TestClient, session: Session) -> None:
    other = create_user(session, email="otra@example.com", password="correct-horse-battery")
    session.flush()
    foreign = Routine(user_id=other.id, name="Ajena")
    session.add(foreign)
    session.flush()

    assert (
        plan_client.put("/api/plan/days", json={"days": [{"weekday": 0, "routine_id": foreign.id}]}).status_code == 422
    )
    change = {"kind": "routine", "routine_id": foreign.id}
    assert plan_client.put("/api/plan/changes/2026-11-09", json=change).status_code == 422


def test_deleting_a_routine_frees_its_usual_days_and_drops_its_changes(
    plan_client: TestClient, session: Session
) -> None:
    upper, lower = routine(plan_client, session, "Torso"), routine(plan_client, session, "Pierna")
    plan_client.put("/api/plan/days", json={"days": [{"weekday": 0, "routine_id": upper}]})
    plan_client.put("/api/plan/changes/2026-11-10", json={"kind": "routine", "routine_id": lower})

    assert plan_client.delete(f"/api/routines/{upper}").status_code == 204
    assert plan_client.delete(f"/api/routines/{lower}").status_code == 204

    week = plan_client.get("/api/plan/week").json()
    assert kinds(week)[:2] == [("free", None), ("rest", None)]
    assert week["days"][1]["changed"] is False


def test_the_plan_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/plan/week").status_code == 401
