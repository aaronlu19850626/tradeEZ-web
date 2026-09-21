from __future__ import annotations

from helpers import web_headers

NAMESPACE = "trade-center.columns"
PAYLOAD = {"day": ["rr", "duration"], "week": ["rr"], "all": ["rr", "points"]}


def test_preference_round_trip(client, db):
    headers = web_headers(db, "preferences@example.com")
    empty = client.get(f"/api/v1/preferences/{NAMESPACE}", headers=headers)
    assert empty.status_code == 200
    assert empty.json() == {"namespace": NAMESPACE, "payload": None, "updated_at": None}

    saved = client.put(f"/api/v1/preferences/{NAMESPACE}", headers=headers, json={"payload": PAYLOAD})
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["payload"] == PAYLOAD
    assert body["updated_at"]

    read_back = client.get(f"/api/v1/preferences/{NAMESPACE}", headers=headers)
    assert read_back.json()["payload"] == PAYLOAD

    # Overwriting the same namespace replaces the payload instead of adding a row.
    replaced = client.put(f"/api/v1/preferences/{NAMESPACE}", headers=headers, json={"payload": {"day": ["rr"]}})
    assert replaced.status_code == 200
    assert replaced.json()["payload"] == {"day": ["rr"]}
    assert db.execute(
        "SELECT COUNT(*) FROM user_preferences WHERE namespace=%s", (NAMESPACE,)
    ).fetchone()[0] == 1


def test_preferences_are_scoped_per_user(client, db):
    owner = web_headers(db, "preferences-owner@example.com")
    stranger = web_headers(db, "preferences-stranger@example.com")
    assert client.put(f"/api/v1/preferences/{NAMESPACE}", headers=owner, json={"payload": PAYLOAD}).status_code == 200
    assert client.get(f"/api/v1/preferences/{NAMESPACE}", headers=stranger).json()["payload"] is None


def test_preference_validation(client, db):
    headers = web_headers(db, "preferences-invalid@example.com")
    # The project maps request-validation failures to 400 with a stable error code.
    assert client.get("/api/v1/preferences/Bad Namespace", headers=headers).status_code == 400
    assert client.put(f"/api/v1/preferences/{NAMESPACE}", headers=headers, json={"payload": []}).status_code == 400
    assert client.put(
        f"/api/v1/preferences/{NAMESPACE}",
        headers=headers,
        json={"payload": {"blob": "x" * 40_000}},
    ).status_code == 413
    assert client.get(f"/api/v1/preferences/{NAMESPACE}").status_code == 401
