import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from gym_tracker.models import Exercise
from gym_tracker.users import create_user
from tests.api.conftest import catalog_exercise_id

pytestmark = pytest.mark.usefixtures("catalog")

HEVY = """\
"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"
"Pierna","15 Jan 2024, 10:30","15 Jan 2024, 11:40","Con prisa","Squat (Barbell)",,"",0,"warmup",60,8,,,
"Pierna","15 Jan 2024, 10:30","15 Jan 2024, 11:40","Con prisa","Squat (Barbell)",,"",1,"normal",100,5,,,8
"Pierna","15 Jan 2024, 10:30","15 Jan 2024, 11:40","Con prisa","Sled Push",,"",0,"normal",80,10,,,
"Torso","17 Jan 2024, 18:00","17 Jan 2024, 19:00","","Bench Press (Barbell)",,"",0,"normal",80,8,,,
"""


def test_preview_says_what_the_file_holds_and_saves_nothing(auth_client: TestClient, session: Session) -> None:
    response = auth_client.post("/api/import/workouts/preview", json={"content": HEVY})

    assert response.status_code == 200
    body = response.json()
    assert {key: body[key] for key in ("source", "workouts", "sets", "duplicates", "first_date", "last_date")} == {
        "source": "hevy",
        "workouts": 2,
        "sets": 4,
        "duplicates": 0,
        "first_date": "2024-01-15",
        "last_date": "2024-01-17",
    }
    squat, sled, bench = body["exercises"]
    assert (squat["name"], squat["sets"], squat["exercise_id"]) == (
        "Squat (Barbell)",
        2,
        catalog_exercise_id(session, "back-squat"),
    )
    assert (sled["name"], sled["exercise_id"]) == ("Sled Push", None)
    assert bench["exercise_id"] == catalog_exercise_id(session, "bench-press")
    assert auth_client.get("/api/workouts").json() == []


def test_import_saves_the_workouts_with_the_users_choice_for_unmatched_names(
    auth_client: TestClient, session: Session
) -> None:
    leg_press = catalog_exercise_id(session, "leg-press")

    response = auth_client.post(
        "/api/import/workouts", json={"content": HEVY, "exercise_ids": {"Sled Push": leg_press}}
    )

    assert response.status_code == 200
    assert response.json() == {"workouts": 2, "sets": 4, "duplicates": 0}
    torso, legs = auth_client.get("/api/workouts").json()
    assert legs["started_at"] == "2024-01-15T09:30:00Z"  # 10:30 in Madrid
    assert legs["ended_at"] == "2024-01-15T10:40:00Z"
    assert legs["notes"] == "Con prisa"
    squat = catalog_exercise_id(session, "back-squat")
    assert [
        (item["exercise_id"], item["set_number"], item["weight_kg"], item["reps"], item["rpe"], item["is_warmup"])
        for item in legs["sets"]
    ] == [
        (squat, 1, 60, 8, None, True),
        (squat, 2, 100, 5, 8, False),
        (leg_press, 1, 80, 10, None, False),
    ]
    assert len(torso["sets"]) == 1


def test_importing_the_same_file_again_adds_nothing(auth_client: TestClient, session: Session) -> None:
    choice = {"Sled Push": catalog_exercise_id(session, "leg-press")}
    auth_client.post("/api/import/workouts", json={"content": HEVY, "exercise_ids": choice})

    preview = auth_client.post("/api/import/workouts/preview", json={"content": HEVY}).json()
    again = auth_client.post("/api/import/workouts", json={"content": HEVY, "exercise_ids": choice})

    assert (preview["workouts"], preview["duplicates"], preview["exercises"]) == (0, 2, [])
    assert again.json() == {"workouts": 0, "sets": 0, "duplicates": 2}
    assert len(auth_client.get("/api/workouts").json()) == 2


def test_this_apps_export_imports_back(auth_client: TestClient, session: Session) -> None:
    squat = catalog_exercise_id(session, "back-squat")
    saved = auth_client.post(
        "/api/workouts",
        json={
            "started_at": "2026-11-18T17:30:00Z",
            "sets": [{"exercise_id": squat, "set_number": 1, "reps": 8, "weight_kg": 37.5, "rpe": 8}],
        },
    ).json()
    exported = auth_client.get("/api/export/workouts.csv").text

    # While the workout is in the account, it is all already there.
    assert auth_client.post("/api/import/workouts/preview", json={"content": exported}).json()["duplicates"] == 1

    auth_client.delete(f"/api/workouts/{saved['id']}")
    response = auth_client.post("/api/import/workouts", json={"content": exported})

    assert response.json() == {"workouts": 1, "sets": 1, "duplicates": 0}
    (workout,) = auth_client.get("/api/workouts").json()
    assert workout["started_at"] == "2026-11-18T17:30:00Z"
    assert [(item["exercise_id"], item["weight_kg"], item["rpe"]) for item in workout["sets"]] == [(squat, 37.5, 8)]


def test_import_refuses_while_a_name_has_no_exercise(auth_client: TestClient) -> None:
    response = auth_client.post("/api/import/workouts", json={"content": HEVY})

    assert response.status_code == 422
    assert "Sled Push" in response.json()["detail"]
    assert auth_client.get("/api/workouts").json() == []


def test_import_refuses_someone_elses_custom_exercise(auth_client: TestClient, session: Session) -> None:
    other = create_user(session, email="other@example.com", password="another-password")
    theirs = Exercise(user_id=other.id, slug="empuje-de-trineo", name="Empuje de trineo", muscle_group="quads")
    session.add(theirs)
    session.flush()

    response = auth_client.post(
        "/api/import/workouts", json={"content": HEVY, "exercise_ids": {"Sled Push": theirs.id}}
    )

    assert response.status_code == 422
    assert auth_client.get("/api/workouts").json() == []


def test_an_unknown_file_is_refused(auth_client: TestClient) -> None:
    response = auth_client.post("/api/import/workouts/preview", json={"content": "a,b\n1,2\n"})

    assert response.status_code == 422
    assert response.json()["detail"] == "Unknown file layout"


def test_import_needs_a_session(client: TestClient) -> None:
    assert client.post("/api/import/workouts/preview", json={"content": HEVY}).status_code == 401
