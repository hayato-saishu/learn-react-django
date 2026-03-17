from fastapi.testclient import TestClient


REGISTER_URL = "/api/accounts/register/"


def test_register_success(client: TestClient):
    response = client.post(
        REGISTER_URL,
        json={"username": "testuser", "email": "test@example.com", "password": "password123"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "testuser"
    assert data["email"] == "test@example.com"
    assert "id" in data
    assert "password" not in data
    assert "hashed_password" not in data


def test_register_duplicate_username(client: TestClient):
    payload = {"username": "dupeuser", "email": "first@example.com", "password": "password123"}
    client.post(REGISTER_URL, json=payload)

    response = client.post(
        REGISTER_URL,
        json={"username": "dupeuser", "email": "second@example.com", "password": "password123"},
    )
    assert response.status_code == 400
    assert "username" in response.json()["detail"]


def test_register_duplicate_email(client: TestClient):
    payload = {"username": "user1", "email": "shared@example.com", "password": "password123"}
    client.post(REGISTER_URL, json=payload)

    response = client.post(
        REGISTER_URL,
        json={"username": "user2", "email": "shared@example.com", "password": "password123"},
    )
    assert response.status_code == 400
    assert "email" in response.json()["detail"]


def test_register_password_too_short(client: TestClient):
    response = client.post(
        REGISTER_URL,
        json={"username": "shortpw", "email": "short@example.com", "password": "abc"},
    )
    assert response.status_code == 422


def test_register_invalid_email(client: TestClient):
    response = client.post(
        REGISTER_URL,
        json={"username": "bademail", "email": "not-an-email", "password": "password123"},
    )
    assert response.status_code == 422


def test_register_missing_fields(client: TestClient):
    response = client.post(REGISTER_URL, json={"username": "onlyname"})
    assert response.status_code == 422
