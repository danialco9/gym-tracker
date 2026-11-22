from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from gym_tracker.api.export import safe_text, spanish_number
from gym_tracker.models import BodyMeasurement, Exercise
from gym_tracker.users import create_user
from tests.api.conftest import catalog_exercise_id

pytestmark = pytest.mark.usefixtures("catalog")


def lines(response_text: str) -> list[str]:
    assert response_text.startswith("﻿"), "Excel needs the byte order mark to read accents"
    return response_text.removeprefix("﻿").splitlines()


def test_exports_workouts_one_row_per_set_for_a_spanish_spreadsheet(auth_client: TestClient, session: Session) -> None:
    squat = catalog_exercise_id(session, "back-squat")
    routine = auth_client.post(
        "/api/routines", json={"name": "Pierna", "exercises": [{"exercise_id": squat, "sets": [{}]}]}
    ).json()
    auth_client.post(
        "/api/workouts",
        json={
            "routine_id": routine["id"],
            # 17:30 UTC is 18:30 in Madrid: the file shows local time.
            "started_at": "2026-11-18T17:30:00Z",
            "notes": "=Rodilla bien",
            "sets": [
                {"exercise_id": squat, "set_number": 1, "reps": 8, "weight_kg": 20, "is_warmup": True},
                {"exercise_id": squat, "set_number": 2, "reps": 8, "weight_kg": 37.5, "rpe": 8},
            ],
        },
    )
    auth_client.post("/api/workouts", json={"started_at": "2026-11-10T10:00:00+01:00"})

    response = auth_client.get("/api/export/workouts.csv")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert 'filename="entrenos-' in response.headers["content-disposition"]
    name = session.get_one(Exercise, squat).name
    # The free workout with no sets has no rows; the note starting with "=" is kept as text.
    assert lines(response.text) == [
        "fecha;hora;rutina;ejercicio;serie;calentamiento;kg;reps;rir;notas",
        f"2026-11-18;18:30;Pierna;{name};1;sí;20;8;;'=Rodilla bien",
        f"2026-11-18;18:30;Pierna;{name};2;no;37,5;8;2;",
    ]


def test_exports_measurements_oldest_first(auth_client: TestClient) -> None:
    auth_client.post("/api/measurements", json={"measured_on": "2026-11-15", "weight_kg": 78.4, "waist_cm": 82})
    auth_client.post("/api/measurements", json={"measured_on": "2026-11-08", "body_fat_pct": 15.5})

    response = auth_client.get("/api/export/measurements.csv")

    assert response.status_code == 200
    assert 'filename="medidas-' in response.headers["content-disposition"]
    assert lines(response.text) == [
        "fecha;peso_kg;grasa_pct;cintura_cm;pecho_cm;brazo_cm;muslo_cm;notas",
        "2026-11-08;;15,5;;;;;",
        "2026-11-15;78,4;;82;;;;",
    ]


def test_exports_only_the_users_own_data(auth_client: TestClient, session: Session) -> None:
    other = create_user(session, email="other@example.com", password="another-password")
    session.add(BodyMeasurement(user_id=other.id, measured_on=date(2026, 11, 1), weight_kg=Decimal("70")))
    session.flush()

    assert len(lines(auth_client.get("/api/export/measurements.csv").text)) == 1
    assert len(lines(auth_client.get("/api/export/workouts.csv").text)) == 1


def test_export_needs_a_session(client: TestClient) -> None:
    assert client.get("/api/export/workouts.csv").status_code == 401


@pytest.mark.parametrize(
    ("value", "text"),
    [(Decimal("37.50"), "37,5"), (Decimal("20.00"), "20"), (Decimal("100"), "100"), (None, "")],
)
def test_spanish_numbers(value: Decimal | None, text: str) -> None:
    assert spanish_number(value) == text


def test_free_text_cannot_run_as_a_formula() -> None:
    assert safe_text('=HYPERLINK("x")') == '\'=HYPERLINK("x")'
    assert safe_text("-5 kg") == "'-5 kg"
    assert safe_text("Bien") == "Bien"
    assert safe_text(None) == ""
