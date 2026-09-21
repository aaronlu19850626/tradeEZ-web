from __future__ import annotations

import hashlib
import hmac
import json
import time

from helpers import make_account


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
    assert upgrade["required_version"] == "2.0.0"
    assert upgrade["download_url"].endswith(".mq5")
