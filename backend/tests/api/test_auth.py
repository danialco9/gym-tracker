from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from gym_tracker.config import Settings
from gym_tracker.models import User
from gym_tracker.security import create_access_token
from gym_tracker.users import UserAlreadyExistsError, create_user
from tests.api.conftest import TEST_EMAIL, TEST_PASSWORD


def login(client: TestClient, email: str = TEST_EMAIL, password: str = TEST_PASSWORD) -> int:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    return int(response.status_code)


@pytest.mark.usefixtures("user")
def test_login_sets_http_only_cookie_and_authenticates(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"email": "Dani@Example.com", "password": TEST_PASSWORD})

    assert response.status_code == 204
    cookie = response.headers["set-cookie"]
    assert cookie.startswith("access_token=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == TEST_EMAIL


@pytest.mark.usefixtures("user")
@pytest.mark.parametrize(
    ("email", "password"),
    [(TEST_EMAIL, "wrong-password"), ("nobody@example.com", TEST_PASSWORD)],
)
def test_login_rejects_invalid_credentials(client: TestClient, email: str, password: str) -> None:
    response = client.post("/api/auth/login", json={"email": email, "password": password})

    assert response.status_code == 401
    assert "set-cookie" not in response.headers


def test_me_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_me_rejects_tampered_token(client: TestClient) -> None:
    client.cookies.set("access_token", "not-a-valid-token")

    assert client.get("/api/auth/me").status_code == 401


def test_the_training_goal_starts_empty_and_can_be_set_and_cleared(auth_client: TestClient) -> None:
    assert auth_client.get("/api/auth/me").json()["goal"] is None

    response = auth_client.patch("/api/auth/me", json={"goal": "recomposition"})
    assert response.status_code == 200
    assert response.json()["goal"] == "recomposition"
    assert auth_client.get("/api/auth/me").json()["goal"] == "recomposition"

    assert auth_client.patch("/api/auth/me", json={}).json()["goal"] == "recomposition"
    assert auth_client.patch("/api/auth/me", json={"goal": None}).json()["goal"] is None


def test_an_unknown_training_goal_is_rejected(auth_client: TestClient) -> None:
    assert auth_client.patch("/api/auth/me", json={"goal": "get_huge"}).status_code == 422


def test_the_sex_starts_empty_and_can_be_set_and_cleared(auth_client: TestClient) -> None:
    assert auth_client.get("/api/auth/me").json()["sex"] is None

    assert auth_client.patch("/api/auth/me", json={"sex": "female"}).json()["sex"] == "female"
    assert auth_client.get("/api/auth/me").json()["sex"] == "female"
    assert auth_client.patch("/api/auth/me", json={"sex": None}).json()["sex"] is None


def test_an_unknown_sex_is_rejected(auth_client: TestClient) -> None:
    assert auth_client.patch("/api/auth/me", json={"sex": "other"}).status_code == 422


def test_the_nickname_starts_empty_and_can_be_set_and_cleared(auth_client: TestClient) -> None:
    me = auth_client.get("/api/auth/me").json()
    assert me["nickname"] is None
    assert me["show_in_ranking"] is True

    response = auth_client.patch("/api/auth/me", json={"nickname": " Tigre_82 "})
    assert response.status_code == 200
    assert response.json()["nickname"] == "Tigre_82"

    assert auth_client.patch("/api/auth/me", json={"nickname": None}).json()["nickname"] is None


@pytest.mark.parametrize("nickname", ["ab", "a" * 21, "Atleta 12", "tigre!", "dani@example.com"])
def test_an_invalid_nickname_is_rejected(auth_client: TestClient, nickname: str) -> None:
    assert auth_client.patch("/api/auth/me", json={"nickname": nickname}).status_code == 422


def test_a_nickname_taken_in_any_case_is_a_conflict(auth_client: TestClient, session: Session) -> None:
    other = create_user(session, email="otro@example.com", password=TEST_PASSWORD)
    other.nickname = "Tigre"
    session.commit()

    response = auth_client.patch("/api/auth/me", json={"nickname": "tigre", "goal": "lose_fat"})

    assert response.status_code == 409
    assert auth_client.get("/api/auth/me").json()["goal"] is None


def test_the_user_can_leave_and_rejoin_the_ranking(auth_client: TestClient) -> None:
    assert auth_client.patch("/api/auth/me", json={"show_in_ranking": False}).json()["show_in_ranking"] is False
    assert auth_client.patch("/api/auth/me", json={"show_in_ranking": True}).json()["show_in_ranking"] is True
    assert auth_client.patch("/api/auth/me", json={"show_in_ranking": None}).status_code == 422


def test_updating_the_account_requires_authentication(client: TestClient) -> None:
    assert client.patch("/api/auth/me", json={"goal": "lose_fat"}).status_code == 401


@pytest.mark.usefixtures("user")
def test_logout_clears_session(client: TestClient) -> None:
    assert login(client) == 204

    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


@pytest.mark.usefixtures("user")
@pytest.mark.parametrize(("remember", "persistent"), [(False, False), (True, True)])
def test_only_a_remembered_login_outlives_the_browser(client: TestClient, remember: bool, persistent: bool) -> None:
    response = client.post(
        "/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD, "remember": remember}
    )

    cookie = response.headers["set-cookie"]
    # With neither Max-Age nor Expires, the browser drops the cookie when it closes.
    assert ("Max-Age=604800" in cookie) is persistent
    assert "expires" not in cookie.lower()


def test_signing_up_keeps_the_session(client: TestClient) -> None:
    response = client.post("/api/auth/register", json={"email": "new@example.com", "password": TEST_PASSWORD})

    assert "Max-Age=604800" in response.headers["set-cookie"]


def _sign_in_with(client: TestClient, user: User, settings: Settings, *, remember: bool, age: timedelta) -> None:
    token = create_access_token(str(user.id), settings, remember=remember, now=datetime.now(UTC) - age)
    client.cookies.set("access_token", token)


@pytest.mark.parametrize(
    ("remember", "age", "renewed"),
    [
        (True, timedelta(hours=2), False),
        (True, timedelta(days=2), True),
        (False, timedelta(hours=2), False),
    ],
)
def test_a_remembered_session_is_renewed_once_a_day_while_in_use(
    client: TestClient, user: User, settings: Settings, *, remember: bool, age: timedelta, renewed: bool
) -> None:
    _sign_in_with(client, user, settings, remember=remember, age=age)

    response = client.get("/api/auth/me")

    assert response.status_code == 200
    assert ("set-cookie" in response.headers) is renewed
    if renewed:
        assert "Max-Age=604800" in response.headers["set-cookie"]


def test_a_remembered_session_ends_after_a_week_unused(client: TestClient, user: User, settings: Settings) -> None:
    _sign_in_with(client, user, settings, remember=True, age=timedelta(days=7, minutes=1))

    assert client.get("/api/auth/me").status_code == 401


def test_deleting_the_account_clears_the_cookie_even_when_it_was_due_for_renewal(
    client: TestClient, user: User, settings: Settings
) -> None:
    _sign_in_with(client, user, settings, remember=True, age=timedelta(days=2))

    response = client.request("DELETE", "/api/auth/me", json={"password": TEST_PASSWORD})

    assert response.status_code == 204
    # The renewal is sent too, but browsers apply cookies in order, so the deletion that follows wins.
    cookies = response.headers.get_list("set-cookie")
    assert cookies[-1].startswith("access_token=")
    assert "Max-Age=0" in cookies[-1]


def test_create_user_rejects_duplicates_and_short_passwords(session: Session, user: User) -> None:
    with pytest.raises(UserAlreadyExistsError):
        create_user(session, email=user.email.upper(), password=TEST_PASSWORD)
    with pytest.raises(ValueError, match="at least"):
        create_user(session, email="other@example.com", password="short")
