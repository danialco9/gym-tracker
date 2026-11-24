import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from gym_tracker.models import Exercise, ExerciseNote
from gym_tracker.users import create_user
from tests.api.conftest import catalog_exercise_id

pytestmark = pytest.mark.usefixtures("catalog")


def notes(client: TestClient) -> list[dict[str, object]]:
    response = client.get("/api/exercise-notes")
    assert response.status_code == 200
    return response.json()  # type: ignore[no-any-return]


def test_keeps_one_note_per_exercise_until_it_changes(auth_client: TestClient, session: Session) -> None:
    press = catalog_exercise_id(session, "leg-press")

    saved = auth_client.put(f"/api/exercise-notes/{press}", json={"text": "  Asiento en 4  "})
    assert saved.status_code == 200
    assert saved.json() == {"exercise_id": press, "text": "Asiento en 4"}

    auth_client.put(f"/api/exercise-notes/{press}", json={"text": "Asiento en 5, pies altos"})
    assert notes(auth_client) == [{"exercise_id": press, "text": "Asiento en 5, pies altos"}]


@pytest.mark.parametrize("text", ["", "   "])
def test_an_empty_note_deletes_it(auth_client: TestClient, session: Session, text: str) -> None:
    press = catalog_exercise_id(session, "leg-press")
    auth_client.put(f"/api/exercise-notes/{press}", json={"text": "Asiento en 4"})

    response = auth_client.put(f"/api/exercise-notes/{press}", json={"text": text})

    assert response.json() == {"exercise_id": press, "text": ""}
    assert notes(auth_client) == []
    # Deleting a note that is not there is not an error either.
    assert auth_client.put(f"/api/exercise-notes/{press}", json={"text": ""}).status_code == 200


def test_rejects_a_note_over_200_characters(auth_client: TestClient, session: Session) -> None:
    press = catalog_exercise_id(session, "leg-press")

    assert auth_client.put(f"/api/exercise-notes/{press}", json={"text": "x" * 201}).status_code == 422
    assert notes(auth_client) == []


def test_notes_are_private(auth_client: TestClient, session: Session) -> None:
    other = create_user(session, email="other@example.com", password="another-password")
    own = Exercise(user_id=other.id, slug="remo-gironda", name="Remo Gironda", muscle_group="back")
    session.add(own)
    session.flush()
    press = catalog_exercise_id(session, "leg-press")
    session.add(ExerciseNote(user_id=other.id, exercise_id=press, text="La nota de otra persona"))
    session.flush()

    assert notes(auth_client) == []
    # Someone else's own exercise cannot take a note.
    assert auth_client.put(f"/api/exercise-notes/{own.id}", json={"text": "Hola"}).status_code == 422


def test_notes_need_a_session(client: TestClient) -> None:
    assert client.get("/api/exercise-notes").status_code == 401
