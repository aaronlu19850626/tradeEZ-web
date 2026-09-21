from __future__ import annotations

import json
import time

import pytest

from helpers import deal, make_account, signed_post


def test_sync_handshake_and_capabilities(client, db):
    login = 910200
    token = make_account(db, login)
    response = signed_post(client, "/api/v1/sync/last_sync_time", token, {"mt5_login": login})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["cursor_basis"] == "out_deal_time"
    assert "hmac_sha256" in body["capabilities"]
    assert body["last_sync_time"] == 0


def test_ingest_deals_then_advance_cursor(client, db):
    login = 910201
    token = make_account(db, login)
    rows = [
        deal(9102010, position=910201, entry=0, deal_type=0, open_time=100, deal_time=100),
        deal(9102011, position=910201, entry=1, deal_type=1, open_time=100, deal_time=200),
    ]
    uploaded = signed_post(client, "/api/v1/ingest/deals", token, {"mt5_login": login, "deals": rows})
    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.json()["inserted"] == 2

    advanced = signed_post(client, "/api/v1/sync/update_last_sync_time", token, {"mt5_login": login, "last_sync_time": 200})
    assert advanced.status_code == 200, advanced.text
    assert advanced.json()["last_sync_time"] == 200

    handshake = signed_post(client, "/api/v1/sync/last_sync_time", token, {"mt5_login": login})
    assert handshake.json()["last_sync_time"] == 200


def test_ingest_heartbeat_symbols_snapshots(client, db):
    login = 910202
    token = make_account(db, login)
    assert signed_post(client, "/api/v1/ingest/heartbeat", token, {"mt5_login": login, "account_currency": "USD"}).status_code == 200
    assert signed_post(client, "/api/v1/ingest/symbols", token, {
        "mt5_login": login,
        "symbols": [{"name": "XAUUSD", "digits": 2, "point": 0.01, "tick_value": 1.0, "contract_size": 100.0}],
    }).status_code == 200
    assert signed_post(client, "/api/v1/ingest/snapshots", token, {
        "mt5_login": login,
        "snapshots": [{"balance": 100.0, "equity": 101.0, "margin": 0.0, "free_margin": 101.0, "snapshot_time": 123}],
    }).status_code == 200


def test_heartbeat_rate_limit_is_a_runaway_guard(client, db):
    login = 910208
    token = make_account(db, login)
    # 30 per minute is ~150x the default EA cadence (12/hour per chart), so it
    # only ever trips on a runaway client.
    for _ in range(30):
        assert signed_post(client, "/api/v1/ingest/heartbeat", token, {"mt5_login": login}).status_code == 200
    blocked = signed_post(client, "/api/v1/ingest/heartbeat", token, {"mt5_login": login})
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "RATE_LIMIT_EXCEEDED"


def test_heartbeat_duplicate_within_write_window_skips_writes(client, db):
    login = 910209
    token = make_account(db, login)
    payload = {"mt5_login": login, "account_currency": "USD", "broker_server": "Test-Server"}
    assert signed_post(client, "/api/v1/ingest/heartbeat", token, payload).status_code == 200
    first_seen = db.execute("SELECT last_seen_at FROM heartbeats WHERE account_login=%s", (login,)).fetchone()[0]
    assert signed_post(client, "/api/v1/ingest/heartbeat", token, payload).status_code == 200
    second_seen = db.execute("SELECT last_seen_at FROM heartbeats WHERE account_login=%s", (login,)).fetchone()[0]
    assert second_seen == first_seen
    assert db.execute("SELECT COUNT(*) FROM heartbeat_history WHERE account_login=%s", (login,)).fetchone()[0] == 1


def test_heartbeat_overwrites_incorrect_broker_server(client, db):
    login = 910212
    token = make_account(db, login)
    assert db.execute("SELECT broker_server FROM accounts WHERE mt5_login=%s", (login,)).fetchone()[0] == "Test-Server"

    assert signed_post(
        client,
        "/api/v1/ingest/heartbeat",
        token,
        {"mt5_login": login, "broker_server": "IC Markets-Live"},
    ).status_code == 200
    assert (
        db.execute("SELECT broker_server FROM accounts WHERE mt5_login=%s", (login,)).fetchone()[0]
        == "IC Markets-Live"
    )

    assert signed_post(
        client,
        "/api/v1/ingest/heartbeat",
        token,
        {"mt5_login": login, "broker_server": "IC Markets-Live-02"},
    ).status_code == 200
    assert (
        db.execute("SELECT broker_server FROM accounts WHERE mt5_login=%s", (login,)).fetchone()[0]
        == "IC Markets-Live-02"
    )


def test_heartbeat_history_is_sampled(client, db, monkeypatch):
    from app.sync import service

    login = 910210
    token = make_account(db, login)
    # Bypass the no-op window so both calls really write, but keep the default
    # sampling interval: only the first call should add a history row.
    monkeypatch.setattr(service.settings, "heartbeat_write_interval_seconds", 0)
    assert signed_post(client, "/api/v1/ingest/heartbeat", token, {"mt5_login": login}).status_code == 200
    first_seen = db.execute("SELECT last_seen_at FROM heartbeats WHERE account_login=%s", (login,)).fetchone()[0]
    time.sleep(1.1)
    assert signed_post(client, "/api/v1/ingest/heartbeat", token, {"mt5_login": login}).status_code == 200
    second_seen = db.execute("SELECT last_seen_at FROM heartbeats WHERE account_login=%s", (login,)).fetchone()[0]
    assert second_seen != first_seen
    assert db.execute("SELECT COUNT(*) FROM heartbeat_history WHERE account_login=%s", (login,)).fetchone()[0] == 1


def test_prune_heartbeat_history_keeps_recent_rows(client, db):
    from app.maintenance import prune_heartbeat_history

    login = 910211
    make_account(db, login)
    now = int(time.time())
    db.execute(
        "INSERT INTO heartbeat_history (account_login, timestamp, version) VALUES (?, ?, '2.1')",
        (login, now - 40 * 86400),
    )
    db.execute(
        "INSERT INTO heartbeat_history (account_login, timestamp, version) VALUES (?, ?, '2.1')",
        (login, now),
    )
    db.commit()

    report = prune_heartbeat_history(days=30)
    assert report["deleted"] == 1
    assert report["remaining_before_cutoff"] == 0
    remaining = db.execute(
        "SELECT timestamp FROM heartbeat_history WHERE account_login=%s ORDER BY timestamp",
        (login,),
    ).fetchall()
    assert [int(row["timestamp"]) for row in remaining] == [now]


def test_hmac_signature_is_required(client, db):
    login = 910203
    token = make_account(db, login)
    body = json.dumps({"mt5_login": login}, separators=(",", ":"), sort_keys=True).encode()
    response = client.post(
        "/api/v1/sync/last_sync_time",
        content=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Timestamp": str(int(time.time())),
            "X-Signature": "0" * 64,
        },
    )
    assert response.status_code == 401


def test_duplicate_ticket_with_different_content_is_rejected_not_updated(client, db):
    login = 910204
    token = make_account(db, login)
    first = deal(9102040, position=910204, entry=0, deal_type=0, open_time=100, deal_time=100)
    uploaded = signed_post(client, "/api/v1/ingest/deals", token, {"mt5_login": login, "deals": [first]})
    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.json()["inserted"] == 1

    conflicting = dict(first)
    conflicting["profit"] = 999.0
    conflicting["price"] = 3000.0
    retry = signed_post(client, "/api/v1/ingest/deals", token, {"mt5_login": login, "deals": [conflicting]})
    assert retry.status_code == 200, retry.text
    assert retry.json()["rejected"] == 1
    assert retry.json()["inserted"] == 0

    row = db.execute(
        "SELECT profit, price FROM deals WHERE account_login=%s AND ticket=%s",
        (login, 9102040),
    ).fetchone()
    assert row["profit"] == first["profit"]
    assert row["price"] == first["price"]


def test_snapshot_margin_level_is_computed_or_null(client, db):
    login = 910205
    token = make_account(db, login)
    response = signed_post(client, "/api/v1/ingest/snapshots", token, {
        "mt5_login": login,
        "snapshots": [
            {"balance": 1000.0, "equity": 1100.0, "margin": 500.0, "free_margin": 600.0, "snapshot_time": 5001},
            {"balance": 1000.0, "equity": 1000.0, "margin": 0.0, "free_margin": 1000.0, "snapshot_time": 5002},
        ],
    })
    assert response.status_code == 200, response.text

    with_margin = db.execute(
        "SELECT margin_level FROM snapshots WHERE account_login=%s AND timestamp=%s",
        (login, 5001),
    ).fetchone()
    assert with_margin["margin_level"] == pytest.approx(220.0)

    without_margin = db.execute(
        "SELECT margin_level FROM snapshots WHERE account_login=%s AND timestamp=%s",
        (login, 5002),
    ).fetchone()
    assert without_margin["margin_level"] is None


def test_unknown_fields_are_ignored_not_rejected(client, db):
    login = 910206
    token = make_account(db, login)
    payload = {
        "mt5_login": login,
        "future_field": "should-be-ignored",
        "deals": [deal(9102060, position=910206, entry=0, deal_type=0, open_time=100, deal_time=100)],
    }
    response = signed_post(client, "/api/v1/ingest/deals", token, payload)
    assert response.status_code == 200, response.text
    assert response.json()["inserted"] == 1
