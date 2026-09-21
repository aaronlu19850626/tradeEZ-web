from __future__ import annotations

from types import SimpleNamespace

from app.timekeeping import observe_timezone_candidate
from helpers import make_account


def test_internal_timezone_api_is_disabled_without_token(client, db):
    response = client.get("/api/v1/internal/timezone/profiles")
    assert response.status_code == 404


def test_internal_timezone_api_lists_and_promotes_candidates(client, db, monkeypatch):
    monkeypatch.setattr(
        "app.internal_timezone.get_settings",
        lambda: SimpleNamespace(internal_api_token="internal-test-token"),
    )
    headers = {"X-Internal-Token": "internal-test-token"}
    make_account(db, 941000)
    db.execute("UPDATE accounts SET broker_server=%s WHERE mt5_login=%s", ("UnknownBroker", 941000))
    db.commit()
    observe_timezone_candidate(
        db,
        platform="mt5",
        broker_server="UnknownBroker",
        broker_company=None,
        observed_offset_seconds=7200,
    )
    db.commit()

    candidates = client.get("/api/v1/internal/timezone/candidates", headers=headers)
    assert candidates.status_code == 200
    assert len(candidates.json()) == 1
    candidate_id = candidates.json()[0]["id"]

    promoted = client.post(
        f"/api/v1/internal/timezone/candidates/{candidate_id}/promote",
        headers=headers,
        json={"timezone_name": "Europe/Athens", "dst_profile": "eu"},
    )
    assert promoted.status_code == 200, promoted.text
    assert promoted.json()["timezone_name"] == "Europe/Athens"

    profiles = client.get("/api/v1/internal/timezone/profiles", headers=headers)
    assert profiles.status_code == 200
    assert any(item["match_value"] == "UnknownBroker" for item in profiles.json())


def test_internal_timezone_api_rejects_wrong_token(client, db, monkeypatch):
    monkeypatch.setattr(
        "app.internal_timezone.get_settings",
        lambda: SimpleNamespace(internal_api_token="internal-test-token"),
    )
    response = client.get(
        "/api/v1/internal/timezone/profiles",
        headers={"X-Internal-Token": "wrong"},
    )
    assert response.status_code == 401
