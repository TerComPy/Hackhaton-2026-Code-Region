"""Public HTTP contract checks independent of Express internals."""

from __future__ import annotations

import uuid


def _account(client, *, name="QA Test"):
    email = f"qa-{uuid.uuid4().hex}@example.invalid"
    credentials = {"email": email, "password": "QA-test-password-42", "displayName": name}
    response = client.post("/auth/register", json=credentials)
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["user"]["email"] == email
    assert payload["user"]["role"] == "user"
    assert isinstance(payload["user"]["profileId"], str)
    assert payload["accessToken"]
    return credentials, payload


def _headers(account):
    return {"Authorization": f"Bearer {account['accessToken']}"}


def test_health_and_auth_restrictions(client):
    assert client.get("/health").status_code == 200
    assert client.get("/ready").status_code == 200
    for path in ("/auth/me", "/profile", "/vacancies", "/favorites"):
        response = client.get(path)
        assert response.status_code == 401, (path, response.text)
        assert "code" in response.json()["error"]
    assert client.get("/auth/me", headers={"Authorization": "Bearer malformed"}).status_code == 401


def test_register_login_duplicate_and_profile(client):
    credentials, account = _account(client)
    duplicate = client.post("/auth/register", json={**credentials, "email": credentials["email"].upper()})
    assert duplicate.status_code == 409, duplicate.text
    assert duplicate.json()["error"]["code"] == "EMAIL_EXISTS"
    invalid = client.post("/auth/register", json={**credentials, "email": f"another-{uuid.uuid4().hex}@example.invalid", "role": "admin"})
    assert invalid.status_code == 400
    wrong = client.post("/auth/login", json={"email": credentials["email"], "password": "wrong-password"})
    assert wrong.status_code == 401
    login = client.post("/auth/login", json={"email": credentials["email"].upper(), "password": credentials["password"]})
    assert login.status_code == 200, login.text
    assert login.json()["user"]["id"] == account["user"]["id"]
    token = login.json()["accessToken"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert "password_hash" not in me.text
    profile = client.get("/profile", headers=_headers(account))
    assert profile.status_code == 200
    assert profile.json()["profile"]["displayName"] == credentials["displayName"]
    updated = client.patch("/profile", json={"displayName": "QA Updated", "city": "Москва"}, headers=_headers(account))
    assert updated.status_code == 200
    assert updated.json()["profile"]["city"] == "Москва"


def test_catalog_filters_and_safe_types(client):
    _, account = _account(client)
    r = client.get("/vacancies", headers=_headers(account))
    assert r.status_code == 200, r.text
    rows = r.json()["items"]
    assert len(rows) == 5  # Canonical 4ce04c4 demo seed
    assert all(row["status"] == "active" and isinstance(row["id"], str) for row in rows)
    assert all(isinstance(row["salary_min"], str) for row in rows if row["salary_min"] is not None)
    assert all("password_hash" not in row and "raw_payload" not in row for row in rows)
    first = rows[0]
    card = client.get(f"/vacancies/{first['id']}", headers=_headers(account))
    assert card.status_code == 200, card.text
    assert card.json()["vacancy"]["id"] == first["id"]
    assert card.json()["vacancy"]["is_favorite"] == 0
    pages = [client.get(f"/vacancies?page={i}&pageSize=2", headers=_headers(account)) for i in (1, 2, 3)]
    assert all(p.status_code == 200 for p in pages)
    paged_ids = [r["id"] for page in pages for r in page.json()["items"]]
    assert len(paged_ids) == len(set(paged_ids)) == 5
    assert client.get("/vacancies?page=0", headers=_headers(account)).status_code == 400
    assert client.get("/vacancies?pageSize=101", headers=_headers(account)).status_code == 400
    injected = client.get("/vacancies", params={"city": "' OR 1=1 --"}, headers=_headers(account))
    assert injected.status_code == 200 and injected.json()["items"] == []


def test_favorites_and_owner_isolation(client):
    _, alice = _account(client, name="Alice")
    _, bob = _account(client, name="Bob")
    rows = client.get("/vacancies", headers=_headers(alice)).json()["items"]
    target_id = rows[0]["id"]
    for _ in (1, 2):
        assert client.put(f"/favorites/{target_id}", headers=_headers(alice)).status_code == 204
    alice_saved = client.get("/favorites", headers=_headers(alice))
    bob_saved = client.get("/favorites", headers=_headers(bob))
    assert alice_saved.status_code == 200 and bob_saved.status_code == 200
    assert len(alice_saved.json()["items"]) == 1
    assert bob_saved.json()["items"] == []
    assert client.get(f"/vacancies/{target_id}", headers=_headers(alice)).json()["vacancy"]["is_favorite"] == 1
    assert client.get(f"/vacancies/{target_id}", headers=_headers(bob)).json()["vacancy"]["is_favorite"] == 0
    assert client.delete(f"/favorites/{target_id}", headers=_headers(bob)).status_code == 204
    assert len(client.get("/favorites", headers=_headers(alice)).json()["items"]) == 1
    opened = client.post(f"/vacancies/{target_id}/outbound-click", headers=_headers(alice))
    assert opened.status_code == 200
    assert opened.json()["originalUrl"].startswith("https://")


def test_account_blocking_and_token_version(client, api_environment):
    _, account = _account(client)
    user_id = account["user"]["id"]
    with api_environment["admin"].cursor() as cursor:
        cursor.execute(f"UPDATE `{api_environment['db']}`.users SET status='blocked' WHERE id=%s", (user_id,))
    assert client.get("/auth/me", headers=_headers(account)).status_code == 401
    with api_environment["admin"].cursor() as cursor:
        cursor.execute(f"UPDATE `{api_environment['db']}`.users SET status='active', token_version=token_version+1 WHERE id=%s", (user_id,))
    assert client.get("/auth/me", headers=_headers(account)).status_code == 401
