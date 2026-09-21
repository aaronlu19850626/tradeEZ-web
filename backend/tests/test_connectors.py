from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import date

from app.account_center.schemas import date_to_epoch
from helpers import make_account, web_headers


def signed_request(client, method, path: str, token: str, payload: dict | None):
    body = json.dumps(payload or {}, separators=(",", ":"), sort_keys=True).encode()
    timestamp = str(int(time.time()))
    signature = hmac.new(token.encode(), body + timestamp.encode(), hashlib.sha256).hexdigest()
    return client.request(
        method.upper(),
        path,
        content=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Timestamp": timestamp,
            "X-Signature": signature,
        },
    )


def test_connector_handshake_cursor_and_events(client, db):
    login = 930300
    token = make_account(db, login)
    handshake = signed_request(
        client,
        "post",
        "/api/v1/connectors/handshake",
        token,
        {"platform": "mt5", "account_ref": str(login), "instance_id": "terminal-01", "connector_version": "2.0.0"},
    )
    assert handshake.status_code == 200, handshake.text
    body = handshake.json()
    assert body["platform"] == "mt5"
    assert body["cursor"]["value"] == 0
    connection_id = body["connection_id"]

    events = [
        {
            "event_id": "trade:1",
            "type": "trade",
            "occurred_at": 100,
            "data": {
                "ticket": 9303001,
                "position_id": 930300,
                "order_id": 9303002,
                "symbol": "XAUUSD",
                "entry": 1,
                "type": 1,
                "volume": 0.1,
                "price": 2010.0,
                "sl_price": 2000.0,
                "tp_price": 2020.0,
                "profit": 10.0,
                "swap": -0.5,
                "commission": -0.25,
                "magic": 920717,
                "comment": "connector-test",
                "open_time": 50,
                "deal_time": 100,
            },
        }
    ]
    uploaded = signed_request(
        client,
        "post",
        f"/api/v1/connections/{connection_id}/events",
        token,
        {
            "batch_id": "batch-1",
            "batch_index": 0,
            "batch_count": 1,
            "events": events,
        },
    )
    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.json()["inserted"] == 1
    assert uploaded.json()["cursor"]["value"] == 100

    cursor = signed_request(client, "get", f"/api/v1/connections/{connection_id}/cursor", token, {})
    assert cursor.status_code == 200, cursor.text
    assert cursor.json()["value"] == 100
    deal_row = db.execute(
        "SELECT ticket, symbol, profit FROM deals WHERE account_login = %s AND ticket = %s",
        (login, 9303001),
    ).fetchone()
    assert deal_row is not None
    assert deal_row["symbol"] == "XAUUSD"
    assert deal_row["profit"] == 10.0

    replay = signed_request(
        client,
        "post",
        f"/api/v1/connections/{connection_id}/events",
        token,
        {
            "batch_id": "batch-1",
            "batch_index": 0,
            "batch_count": 1,
            "events": events,
        },
    )
    assert replay.status_code == 200, replay.text
    assert replay.json()["replay"] is True
    assert replay.json()["duplicates"] == 1

    conflicting = signed_request(
        client,
        "post",
        f"/api/v1/connections/{connection_id}/events",
        token,
        {
            "batch_id": "batch-1",
            "batch_index": 0,
            "batch_count": 1,
            "events": [{**events[0], "data": {**events[0]["data"], "profit": 999.0}}],
        },
    )
    assert conflicting.status_code == 409
    assert conflicting.json()["error"]["code"] == "BATCH_CONTENT_CONFLICT"


def test_connector_requires_valid_signature(client, db):
    login = 930301
    token = make_account(db, login)
    payload = {"platform": "mt5", "account_ref": str(login)}
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    response = client.post(
        "/api/v1/connectors/handshake",
        content=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Timestamp": str(int(time.time())),
            "X-Signature": "0" * 64,
        },
    )
    assert response.status_code == 401


def test_connector_reports_required_upgrade(client, db):
    login = 930302
    token = make_account(db, login)
    response = signed_request(
        client,
        "post",
        "/api/v1/connectors/handshake",
        token,
        {"platform": "mt5", "account_ref": str(login), "connector_version": "1.0.0"},
    )
    assert response.status_code == 200, response.text
    upgrade = response.json()["upgrade"]
    assert upgrade["required"] is True
    assert upgrade["required_version"] == "2.0.1"
    assert upgrade["download_url"].endswith(".mq5")


def test_connector_heartbeat_overwrites_broker_server(client, db):
    login = 930303
    token = make_account(db, login)
    handshake = signed_request(
        client,
        "post",
        "/api/v1/connectors/handshake",
        token,
        {"platform": "mt5", "account_ref": str(login), "instance_id": "terminal-01", "connector_version": "2.0.0"},
    )
    assert handshake.status_code == 200, handshake.text
    connection_id = handshake.json()["connection_id"]

    heartbeat = signed_request(
        client,
        "post",
        f"/api/v1/connections/{connection_id}/events",
        token,
        {
            "batch_id": "heartbeat-broker-1",
            "batch_index": 0,
            "batch_count": 1,
            "events": [
                {
                    "event_id": "heartbeat:broker:1",
                    "type": "heartbeat",
                    "occurred_at": 100,
                    "data": {"connector_status": "online", "broker_server": "IC Markets-Live"},
                }
            ],
        },
    )
    assert heartbeat.status_code == 200, heartbeat.text
    cursor = signed_request(client, "get", f"/api/v1/connections/{connection_id}/cursor", token, {})
    assert cursor.status_code == 200, cursor.text
    assert cursor.json()["value"] == 0
    assert (
        db.execute("SELECT broker_server FROM accounts WHERE mt5_login=%s", (login,)).fetchone()[0]
        == "IC Markets-Live"
    )

    corrected = signed_request(
        client,
        "post",
        f"/api/v1/connections/{connection_id}/events",
        token,
        {
            "batch_id": "heartbeat-broker-2",
            "batch_index": 0,
            "batch_count": 1,
            "events": [
                {
                    "event_id": "heartbeat:broker:2",
                    "type": "heartbeat",
                    "occurred_at": 200,
                    "data": {"connector_status": "online", "broker_server": "IC Markets-Live-02"},
                }
            ],
        },
    )
    assert corrected.status_code == 200, corrected.text
    assert (
        db.execute("SELECT broker_server FROM accounts WHERE mt5_login=%s", (login,)).fetchone()[0]
        == "IC Markets-Live-02"
    )


def test_reset_clears_connector_state_and_restarts_from_sync_start(client, db):
    login = 930304
    headers = web_headers(db, "connector-reset@example.com")
    created = client.post(
        "/api/v1/accounts",
        headers=headers,
        json={
            "name": "Connector reset",
            "platform": "mt5",
            "currency": "USD",
            "mt5_login": login,
            "sync_start_date": "2026-01-01",
        },
    )
    assert created.status_code == 201, created.text
    account = created.json()
    token = account["sync_key"]

    handshake = signed_request(
        client,
        "post",
        "/api/v1/connectors/handshake",
        token,
        {"platform": "mt5", "account_ref": str(login), "instance_id": "reset-terminal", "connector_version": "2.0.0"},
    )
    assert handshake.status_code == 200, handshake.text
    assert handshake.json()["cursor"]["value"] == date_to_epoch(date(2026, 1, 1))
    connection_id = handshake.json()["connection_id"]

    occurred_at = date_to_epoch(date(2026, 1, 15))
    uploaded = signed_request(
        client,
        "post",
        f"/api/v1/connections/{connection_id}/events",
        token,
        {
            "batch_id": "trade-reset-before",
            "batch_index": 0,
            "batch_count": 1,
            "events": [
                {
                    "event_id": "trade:reset:1",
                    "type": "trade",
                    "occurred_at": occurred_at,
                    "data": {
                        "ticket": 9303041,
                        "position_id": 930304,
                        "order_id": 9303042,
                        "symbol": "XAUUSD",
                        "entry": 1,
                        "type": 1,
                        "volume": 0.1,
                        "price": 2010.0,
                        "sl_price": 2000.0,
                        "tp_price": 2020.0,
                        "profit": 10.0,
                        "swap": 0.0,
                        "commission": 0.0,
                        "magic": 0,
                        "comment": "reset-test",
                        "open_time": occurred_at - 60,
                        "deal_time": occurred_at,
                    },
                }
            ],
        },
    )
    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.json()["cursor"]["value"] == occurred_at
    connection = db.execute("SELECT id FROM connector_connections WHERE account_id=%s", (account["id"],)).fetchone()
    assert connection is not None
    assert db.execute("SELECT COUNT(*) FROM connector_events WHERE connection_id=%s", (connection["id"],)).fetchone()[0] > 0

    reset_start = date(2026, 9, 1)
    reset = client.post(
        f"/api/v1/accounts/{account['id']}/reset-sync",
        headers=headers,
        json={"name": account["name"], "sync_start_date": reset_start.isoformat()},
    )
    assert reset.status_code == 200, reset.text
    connection = db.execute("SELECT id, cursor_value FROM connector_connections WHERE account_id=%s", (account["id"],)).fetchone()
    assert connection is not None
    assert int(connection["cursor_value"]) == date_to_epoch(reset_start)
    assert db.execute("SELECT COUNT(*) FROM connector_events WHERE connection_id=%s", (connection["id"],)).fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM connector_batches WHERE connection_id=%s", (connection["id"],)).fetchone()[0] == 0

    cursor = signed_request(client, "get", f"/api/v1/connections/{connection_id}/cursor", token, {})
    assert cursor.status_code == 200, cursor.text
    assert cursor.json()["value"] == date_to_epoch(reset_start)
    assert db.execute("SELECT resync_pending FROM accounts WHERE id=%s", (account["id"],)).fetchone()[0] == 0
