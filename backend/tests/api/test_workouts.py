from datetime import datetime
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from gym_tracker.models import Routine, Workout
from gym_tracker.users import create_user
from tests.api.conftest import catalog_exercise_id

pytestmark = pytest.mark.usefixtures("catalog")

STARTED_AT = "2026-09-15T18:00:00+02:00"


def set_payload(
    exercise_id: int, set_number: int, *, reps: int = 10, weight_kg: float = 50, rpe: float | None = 8
) -> dict[str, object]:
    return {"exercise_id": exercise_id, "set_number": set_number, "reps": reps, "weight_kg": weight_kg, "rpe": rpe}


def workout_payload(started_at: str = STARTED_AT, **fields: object) -> dict[str, object]:
    return {"started_at": started_at, **fields}


def test_log_workout_with_sets(auth_client: TestClient, session: Session) -> None:
    pulldown = catalog_exercise_id(session, "lat-pulldown")
    payload = workout_payload(
        ended_at="2026-09-15T19:10:00+02:00",
        notes="Buen día",
        sets=[set_payload(pulldown, 1, rpe=7), set_payload(pulldown, 2, weight_kg=52.5)],
    )

    response = auth_client.post("/api/workouts", json=payload)

    assert response.status_code == 201
    workout = response.json()
    assert datetime.fromisoformat(workout["started_at"]) == datetime.fromisoformat(STARTED_AT)
    assert [(s["set_number"], s["weight_kg"], s["rpe"]) for s in workout["sets"]] == [(1, 50.0, 7.0), (2, 52.5, 8.0)]
    assert auth_client.get(f"/api/workouts/{workout['id']}").json() == workout


def test_add_and_remove_sets_during_workout(auth_client: TestClient, session: Session) -> None:
    leg_press = catalog_exercise_id(session, "leg-press")
    workout_id = auth_client.post("/api/workouts", json=workout_payload()).json()["id"]

    added = auth_client.post(f"/api/workouts/{workout_id}/sets", json=set_payload(leg_press, 1, reps=12, weight_kg=120))
    assert added.status_code == 201
    assert auth_client.post(f"/api/workouts/{workout_id}/sets", json=set_payload(leg_press, 1)).status_code == 409

    assert auth_client.delete(f"/api/workouts/{workout_id}/sets/{added.json()['id']}").status_code == 204
    assert auth_client.get(f"/api/workouts/{workout_id}").json()["sets"] == []


@pytest.mark.parametrize(
    "payload",
    [
        workout_payload(ended_at="2026-09-15T17:00:00+02:00"),
        workout_payload(started_at="2026-09-15T18:00:00"),
    ],
)
def test_rejects_invalid_times(auth_client: TestClient, payload: dict[str, object]) -> None:
    assert auth_client.post("/api/workouts", json=payload).status_code == 422


def test_rejects_duplicate_set_numbers(auth_client: TestClient, session: Session) -> None:
    squat = catalog_exercise_id(session, "back-squat")
    payload = workout_payload(sets=[set_payload(squat, 1), set_payload(squat, 1)])

    assert auth_client.post("/api/workouts", json=payload).status_code == 422


def test_sending_the_same_workout_again_does_not_save_it_twice(auth_client: TestClient, session: Session) -> None:
    squat = catalog_exercise_id(session, "back-squat")
    payload = workout_payload(client_id=str(uuid4()), sets=[set_payload(squat, 1), set_payload(squat, 2)])

    first = auth_client.post("/api/workouts", json=payload)
    # The phone lost the answer to the first request and retries from its queue.
    again = auth_client.post("/api/workouts", json=payload)

    assert first.status_code == 201
    assert again.status_code == 200
    assert again.json() == first.json()
    assert [workout["id"] for workout in auth_client.get("/api/workouts").json()] == [first.json()["id"]]


def test_client_ids_are_scoped_to_each_user(auth_client: TestClient, session: Session) -> None:
    client_id = uuid4()
    other = create_user(session, email="other@example.com", password="another-password")
    session.add(Workout(user_id=other.id, client_id=client_id, started_at=datetime.fromisoformat(STARTED_AT)))
    session.flush()

    response = auth_client.post("/api/workouts", json=workout_payload(client_id=str(client_id)))

    assert response.status_code == 201
    saved = session.get(Workout, response.json()["id"])
    assert saved is not None
    assert saved.client_id == UUID(str(client_id))


def test_workouts_without_client_id_are_always_new(auth_client: TestClient) -> None:
    assert auth_client.post("/api/workouts", json=workout_payload()).status_code == 201
    assert auth_client.post("/api/workouts", json=workout_payload()).status_code == 201
    assert len(auth_client.get("/api/workouts").json()) == 2


def test_list_is_newest_first_and_paginated(auth_client: TestClient) -> None:
    for day in (13, 15, 14):
        assert (
            auth_client.post("/api/workouts", json=workout_payload(f"2026-09-{day}T18:00:00+02:00")).status_code == 201
        )

    first_page = auth_client.get("/api/workouts", params={"limit": 2}).json()
    second_page = auth_client.get("/api/workouts", params={"limit": 2, "offset": 2}).json()

    assert [workout["started_at"][:10] for workout in first_page] == ["2026-09-15", "2026-09-14"]
    assert [workout["started_at"][:10] for workout in second_page] == ["2026-09-13"]


def test_list_keeps_the_workouts_of_the_local_dates_asked(auth_client: TestClient) -> None:
    # Madrid time: the first and last are September and November there, whatever UTC says.
    for started_at in (
        "2026-09-30T23:30:00+02:00",
        "2026-10-01T00:30:00+02:00",
        "2026-10-31T23:30:00+01:00",
        "2026-11-01T08:00:00+01:00",
    ):
        assert auth_client.post("/api/workouts", json=workout_payload(started_at)).status_code == 201

    october = auth_client.get("/api/workouts", params={"start": "2026-10-01", "end": "2026-11-01"}).json()

    assert [datetime.fromisoformat(workout["started_at"]) for workout in october] == [
        datetime.fromisoformat("2026-10-31T23:30:00+01:00"),
        datetime.fromisoformat("2026-10-01T00:30:00+02:00"),
    ]


def test_replace_workout(auth_client: TestClient, session: Session) -> None:
    curl = catalog_exercise_id(session, "dumbbell-curl")
    created = auth_client.post("/api/workouts", json=workout_payload(sets=[set_payload(curl, 1), set_payload(curl, 2)]))
    payload = workout_payload(notes="Corregido", sets=[set_payload(curl, 1, reps=12, weight_kg=14)])

    response = auth_client.put(f"/api/workouts/{created.json()['id']}", json=payload)

    assert response.status_code == 200
    assert response.json()["notes"] == "Corregido"
    assert [(s["reps"], s["weight_kg"]) for s in response.json()["sets"]] == [(12, 14.0)]


def test_rejects_routine_of_other_user(auth_client: TestClient, session: Session) -> None:
    other = create_user(session, email="other@example.com", password="another-password")
    routine = Routine(user_id=other.id, name="Ajena")
    session.add(routine)
    session.flush()

    assert auth_client.post("/api/workouts", json=workout_payload(routine_id=routine.id)).status_code == 422


def test_deleting_routine_keeps_its_workouts(auth_client: TestClient) -> None:
    routine_id = auth_client.post("/api/routines", json={"name": "Pull"}).json()["id"]
    workout_id = auth_client.post("/api/workouts", json=workout_payload(routine_id=routine_id)).json()["id"]

    assert auth_client.delete(f"/api/routines/{routine_id}").status_code == 204
    assert auth_client.get(f"/api/workouts/{workout_id}").json()["routine_id"] is None

    assert auth_client.delete(f"/api/workouts/{workout_id}").status_code == 204
    assert auth_client.get(f"/api/workouts/{workout_id}").status_code == 404
