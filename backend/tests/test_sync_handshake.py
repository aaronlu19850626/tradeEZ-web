from __future__ import annotations

import hashlib
import hmac
import json
import os
import sqlite3
import time
from pathlib import Path
import tempfile

import pytest


TEST_DIRECTORY = tempfile.TemporaryDirectory(prefix="tradesync-handshake-")
TEST_DB = Path(TEST_DIRECTORY.name) / "test.db"
os.environ["TRADESYNC_DB_PATH"] = str(TEST_DB)
os.environ["TRADESYNC_SYNC_KEY_ENCRYPTION_SECRET"] = "unit-test-encryption-secret"
os.environ["TRADESYNC_AUTH_SECRET"] = "unit-test-auth-secret"
os.environ["TRADESYNC_EMAIL_PROVIDER"] = "console"
os.environ["TRADESYNC_DEV_FIXED_LOGIN_CODE"] = ""
os.environ["TRADESYNC_AUTH_TEST_MODE"] = "false"
os.environ["TRADESYNC_ENVIRONMENT"] = "test"

from fastapi.testclient import TestClient

from app.config import get_settings
from app.crypto import encrypt_sync_key
from app.main import app
from app.security import create_access_token
from app.v2_api import _rate_buckets, check_rate_limit
from app.v2_models import ApiError
from concurrent.futures import ThreadPoolExecutor


settings = get_settings()


def web_headers(db, email):
    db.execute("INSERT INTO users(email) VALUES(?)", (email,))
    db.commit()
    user = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    return {"Authorization": "Bearer " + create_access_token(user, settings)}


def test_web_accounts_enforce_ownership_and_rotate_key(client, db):
    owner = web_headers(db, "owner@example.com")
    stranger = web_headers(db, "stranger@example.com")
    created = client.post("/api/v1/accounts", headers=owner, json={"mt5_login": 200001, "broker_server": "Test-Server", "sync_start_time": 0})
    assert created.status_code == 201, created.text
    account_id, old_key = created.json()["id"], created.json()["sync_key"]
    for method, path, body in [
        ("GET", f"/api/v1/accounts/{account_id}", None),
        ("PATCH", f"/api/v1/accounts/{account_id}", {"status": "disabled"}),
        ("POST", f"/api/v1/accounts/{account_id}/regenerate-key", None),
    ]:
        assert client.request(method, path, headers=stranger, json=body).status_code == 404
    assert client.get("/api/v1/accounts", headers=stranger).json() == []
    public = client.get(f"/api/v1/accounts/{account_id}", headers=owner).json()
    assert not {"sync_key", "key_hash", "key_encrypted"} & public.keys()
    assert client.get("/api/v1/accounts").status_code == 401
    assert signed_post(client, "/api/v1/ingest/heartbeat", old_key, {"mt5_login": 200001}).status_code == 200
    rotated = client.post(f"/api/v1/accounts/{account_id}/regenerate-key", headers=owner)
    assert rotated.status_code == 200, rotated.text
    new_key = rotated.json()["sync_key"]
    assert new_key != old_key
    assert signed_post(client, "/api/v1/ingest/heartbeat", old_key, {"mt5_login": 200001}).status_code == 401
    assert signed_post(client, "/api/v1/ingest/heartbeat", new_key, {"mt5_login": 200001}).status_code == 200
    assert client.patch(f"/api/v1/accounts/{account_id}", headers=owner, json={"status": "disabled"}).status_code == 200
    assert signed_post(client, "/api/v1/ingest/heartbeat", new_key, {"mt5_login": 200001}).status_code == 403
    assert client.patch(f"/api/v1/accounts/{account_id}", headers=owner, json={"status": "active"}).status_code == 200
    assert signed_post(client, "/api/v1/ingest/heartbeat", new_key, {"mt5_login": 200001}).status_code == 200


def test_concurrent_account_binding_returns_one_conflict(client, db):
    headers = web_headers(db, "concurrent-account@example.com")
    def create(_):
        return client.post("/api/v1/accounts", headers=headers, json={"mt5_login": 200002, "broker_server": "Test-Server", "sync_start_time": 0}).status_code
    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = list(executor.map(create, range(2)))
    assert sorted(statuses) == [201, 409]
    assert db.execute("SELECT COUNT(*) FROM accounts WHERE mt5_login=200002").fetchone()[0] == 1


def test_email_login_concurrent_verification_is_single_use(client, db, monkeypatch):
    from app.web_auth import service
    messages = []
    monkeypatch.setattr(service, "send_verification_email", lambda settings, email, code, ttl: messages.append((email, code)))
    email = "concurrent-login@example.com"
    assert client.post("/api/v1/auth/send-code", json={"email": email}).status_code == 200
    assert client.post("/api/v1/auth/send-code", json={"email": email}).status_code == 429
    code = messages[0][1]
    assert db.execute("SELECT code_hash FROM auth_codes WHERE email=?", (email,)).fetchone()[0] != code
    def verify(_):
        return client.post("/api/v1/auth/verify-code", json={"email": email, "code": code})
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(verify, range(2)))
    assert sorted(r.status_code for r in responses) == [200, 400]
    success = next(r.json() for r in responses if r.status_code == 200)
    assert success["is_new_user"] is True
    current = client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + success["access_token"]})
    assert current.status_code == 200
    assert current.json()["email"] == email
    assert db.execute("SELECT COUNT(*) FROM users WHERE email=?", (email,)).fetchone()[0] == 1


def test_login_attempt_limit_and_resend_invalidate_older_codes(client, db, monkeypatch):
    from app.web_auth import service
    messages = []
    monkeypatch.setattr(service, "send_verification_email", lambda settings, email, code, ttl: messages.append(code))
    sequence = iter([123456, 654321])
    monkeypatch.setattr(service.secrets, "randbelow", lambda _: next(sequence))
    email = "resend@example.com"
    assert client.post("/api/v1/auth/send-code", json={"email": email}).status_code == 200
    db.execute("UPDATE auth_codes SET created_at=created_at-120 WHERE email=?", (email,))
    db.commit()
    assert client.post("/api/v1/auth/send-code", json={"email": email}).status_code == 200
    for _ in range(5):
        assert client.post("/api/v1/auth/verify-code", json={"email": email, "code": "000000"}).status_code == 400
    for code in messages:
        assert client.post("/api/v1/auth/verify-code", json={"email": email, "code": code}).status_code == 400
    assert db.execute("SELECT COUNT(*) FROM auth_codes WHERE email=? AND consumed=0", (email,)).fetchone()[0] == 0


def test_failed_user_creation_rolls_back_code_consumption(client, db, monkeypatch):
    from app.web_auth import service
    from app.schemas import VerifyCodeIn
    email = "rollback-login@example.com"
    now = int(time.time())
    db.execute("INSERT INTO auth_codes(email,code_hash,expires_at,created_at) VALUES(?,?,?,?)", (email, service.code_hash(email, "123456"), now+600, now))
    db.commit()
    def fail(*args):
        raise sqlite3.OperationalError("injected user creation failure")
    monkeypatch.setattr(service.repository, "insert_user", fail)
    with pytest.raises(sqlite3.OperationalError, match="injected"):
        service.verify_login_code(VerifyCodeIn(email=email, code="123456"), db)
    assert not db.in_transaction
    assert db.execute("SELECT consumed FROM auth_codes WHERE email=?", (email,)).fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM users WHERE email=?", (email,)).fetchone()[0] == 0


def test_fact_and_log_queries_isolate_accounts_and_paginate_stably(client, db):
    owner = web_headers(db, "facts-owner@example.com")
    stranger = web_headers(db, "facts-stranger@example.com")
    accounts = []
    now = int(time.time()) - 600
    # Insert higher login first so identity tie-breaking is tested independently
    # of insertion order, with the same ticket and position across accounts.
    for login, headers in [(300002, owner), (300001, owner), (300003, stranger)]:
        created = client.post("/api/v1/accounts", headers=headers, json={"mt5_login": login, "broker_server": "Test-Server", "sync_start_time": 0})
        assert created.status_code == 201, created.text
        account = created.json()
        accounts.append(account)
        key = account["sync_key"]
        assert signed_post(client, "/api/v1/sync/last_sync_time", key, {"mt5_login": login}).status_code == 200
        uploaded = signed_post(client, "/api/v1/ingest/deals", key, {
            "mt5_login": login, "server_gmt_off": 0,
            "deals": [deal(90001, position=90001, entry=0, deal_type=0, open_time=now, deal_time=now)],
        })
        assert uploaded.status_code == 200, uploaded.text
        snapshot = signed_post(client, "/api/v1/ingest/settings", key, {
            "mt5_login": login, "snapshot_time": now, "settings": {"general": {"enabled": True}},
        })
        assert snapshot.status_code == 200, snapshot.text

    for sort in ("deal_time_desc", "deal_time_asc", "ticket_desc", "open_time_asc"):
        pages = [client.get(f"/api/v1/my/raw-deals?page_size=1&page={page}&sort={sort}", headers=owner).json() for page in (1, 2)]
        assert all(p["total"] == 2 for p in pages)
        assert [p["items"][0]["account_login"] for p in pages] == [300001, 300002]
    for sort, expected in [("open_time_desc", [300002, 300001]), ("open_time_asc", [300001, 300002])]:
        pages = [client.get(f"/api/v1/my/orders?page_size=1&page={page}&sort={sort}", headers=owner).json() for page in (1, 2)]
        assert all(p["total"] == 2 for p in pages)
        assert [p["items"][0]["account_login"] for p in pages] == expected

    private_id = accounts[-1]["id"]
    for path in [
        f"/api/v1/my/raw-deals?account_id={private_id}",
        f"/api/v1/my/orders?account_id={private_id}",
        *[f"/api/v1/my/accounts/{private_id}/{kind}" for kind in ("deals", "positions", "settings")],
    ]:
        assert client.get(path, headers=owner).status_code == 404
    assert client.get(f"/api/v1/my/sync-runs?account_id={private_id}", headers=owner).json()["total"] == 0
    own_denials = client.get("/api/v1/my/api-logs?mt5_login=300003", headers=owner).json()
    # Users may see their own denied requests, but not another user's sync data.
    assert len(own_denials) == 3
    assert all(log["status_code"] == 404 for log in own_denials)
    assert all(log["path"].startswith(f"/api/v1/my/accounts/{private_id}/") for log in own_denials)
    assert all(log["item_count"] is None for log in own_denials)
    runs = client.get("/api/v1/my/sync-runs", headers=owner).json()
    assert runs["total"] == 2
    assert {r["account_id"] for r in runs["items"]} == {a["id"] for a in accounts[:2]}
    settings_response = client.get(f"/api/v1/my/accounts/{accounts[0]['id']}/settings", headers=owner)
    assert settings_response.json()[0]["settings"] == {"general": {"enabled": True}}
    filtered = client.get(f"/api/v1/my/raw-deals?account_id={accounts[0]['id']}&ticket=90001&entry=0", headers=owner).json()
    assert filtered["total"] == 1
    assert filtered["items"][0]["account_login"] == 300002
    assert client.get("/api/v1/my/raw-deals?sort=invalid", headers=owner).status_code == 400
    assert client.get("/api/v1/my/raw-deals").status_code == 401
    detail_path = f"/api/v1/my/accounts/{accounts[0]['id']}/deals/90001"
    detail = client.get(detail_path, headers=owner)
    assert detail.status_code == 200
    assert detail.json()["deal"]["account_login"] == 300002
    assert detail.json()["source_batches"] == []  # Legacy upload has no batch reference.
    assert detail.json()["source_total"] == 0
    assert client.get(detail_path, headers=stranger).status_code == 404
    assert client.get(detail_path, headers=owner, params={"page_size": 101}).status_code == 400
    assert client.get(detail_path + "0", headers=owner).status_code == 404


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as client:
        yield client
@pytest.fixture(scope="module")
def db(client):
    conn = sqlite3.connect(TEST_DB)
    conn.row_factory = sqlite3.Row
    yield conn
    conn.close()


def make_account(db: sqlite3.Connection, login: int, status: str = "active") -> str:
    user = db.execute("SELECT id FROM users WHERE email = ?", ("tester@example.com",)).fetchone()
    if user is None:
        cursor = db.execute("INSERT INTO users (email) VALUES (?)", ("tester@example.com",))
        user_id = int(cursor.lastrowid)
    else:
        user_id = int(user["id"])
    token = f"sk_live_{login}_abcdefghijklmnopqrstuvwxyz0123456789ABCD"
    db.execute(
        """
        INSERT INTO accounts (
            user_id, mt5_login, label, broker_server, account_currency,
            status, key_prefix, key_hash, key_encrypted, key_environment
        ) VALUES (?, ?, ?, 'Test-Server', 'USD', ?, ?, ?, ?, 'live')
        """,
        (
            user_id,
            login,
            f"Account {login}",
            status,
            token.split("_", 2)[2][:12],
            hashlib.sha256(token.encode()).hexdigest(),
            encrypt_sync_key(token, settings),
        ),
    )
    db.commit()
    return token


def signed_post(client: TestClient, path: str, token: str, payload: dict) -> object:
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    timestamp = str(int(time.time()))
    signature = hmac.new(token.encode(), body + timestamp.encode(), hashlib.sha256).hexdigest()
    return client.post(
        path,
        content=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Timestamp": timestamp,
            "X-Signature": signature,
        },
    )


def deal(ticket: int, *, position: int, entry: int, deal_type: int, open_time: int, deal_time: int, volume: float = 0.01) -> dict:
    return {
        "ticket": ticket,
        "position_id": position,
        "order_id": ticket + 100000,
        "symbol": "XAUUSD",
        "entry": entry,
        "type": deal_type,
        "volume": volume,
        "price": 2000.0 + ticket % 10,
        "sl_price": 1990.0,
        "tp_price": 2020.0,
        "profit": 10.0 if entry == 1 else 0.0,
        "swap": -0.5,
        "commission": -0.25,
        "magic": 920717,
        "comment": "unit-test",
        "open_time": open_time,
        "deal_time": deal_time,
    }


def test_sop_close_cursor_failed_batch_retry_and_large_ids(client, db):
    login = 310001
    token = make_account(db, login)
    started = int(time.time()) - 7200
    closed = started + 3600
    big = 9007199254740993
    opening = deal(big, position=big, entry=0, deal_type=0, open_time=closed, deal_time=started)
    closing = deal(big + 1, position=big, entry=1, deal_type=1, open_time=closed, deal_time=closed)
    opening["magic"] = big
    # Document-shaped requests deliberately have no instance, batch or protocol fields.
    cursor = signed_post(client, "/api/v1/sync/last_sync_time", token, {"mt5_login": login})
    assert cursor.status_code == 200 and cursor.json()["cursor_basis"] == "out_deal_time"
    def upload(rows):
        return signed_post(client, "/api/v1/ingest/deals", token, {"mt5_login": login, "deals": rows})
    def confirm(value):
        return signed_post(client, "/api/v1/sync/update_last_sync_time", token,
                           {"mt5_login": login, "last_sync_time": value})
    assert upload([opening]).status_code == 200
    # Batch two fails: first stays durable, cursor cannot use misleading client open_time.
    assert upload([{**closing, "ticket": 0}]).status_code == 400
    assert confirm(closed).status_code == 409
    assert confirm(started).status_code == 409
    assert db.execute("SELECT last_sync_time FROM accounts WHERE mt5_login=?", (login,)).fetchone()[0] == 0
    assert upload([closing]).status_code == 200
    assert confirm(closed + 1).status_code == 409
    # Retrying all batches after a lost confirmation is safe.
    assert upload([opening, closing]).json()["duplicates"] == 2
    assert confirm(closed).status_code == 200
    assert confirm(closed).json()["updated"] is False
    assert confirm(started).json()["last_sync_time"] == closed
    assert db.execute("SELECT COUNT(*) FROM deals WHERE account_login=?", (login,)).fetchone()[0] == 2
    user = db.execute("SELECT * FROM users WHERE email='tester@example.com'").fetchone()
    headers = {"Authorization": "Bearer " + create_access_token(user, settings)}
    account_id = db.execute("SELECT id FROM accounts WHERE mt5_login=?", (login,)).fetchone()[0]
    raw = client.get(f"/api/v1/my/accounts/{account_id}/deals/{big}", headers=headers)
    assert raw.status_code == 200
    assert raw.json()["deal"]["ticket"] == str(big)
    assert raw.json()["deal"]["position_id"] == str(big)
    assert raw.json()["deal"]["magic"] == str(big)
    orders = client.get(f"/api/v1/my/orders?account_id={account_id}", headers=headers).json()["items"]
    assert orders[0]["position_id"] == str(big)
    assert orders[0]["open_time"] == started
    assert orders[0]["is_closed"] is True


def test_sop_non_trade_enum_and_integer_bounds(client, db):
    login = 310002
    token = make_account(db, login)
    record = deal(6001, position=6001, entry=0, deal_type=7, open_time=100, deal_time=100, volume=0)
    record["price"] = 0
    def upload(item):
        return signed_post(client, "/api/v1/ingest/deals", token, {"mt5_login": login, "deals": [item]})
    assert upload(record).status_code == 200
    for value in (9223372036854775808, 6001.0, True):
        assert upload({**record, "ticket": value}).status_code == 400
    assert upload({**record, "price": float("inf")}).status_code == 400


def test_sop_minimal_metadata_endpoints_and_raw_body_signature(client, db):
    login = 310003
    token = make_account(db, login)
    now = int(time.time())
    fields = {
        "basic": "magic magic_scalp magic_trend comment_scalp comment_trend slippage refresh_seconds ui_scale use_session session_start session_end reset_hour reset_minute export_on_reset",
        "risk": "daily_max_drawdown daily_profit_target scalp_drawdown_ratio trend_drawdown_ratio weekly_profit_target consec_loss_limit cooldown_minutes enable_circuit_breaker alert_on_breaker",
        "scalp": "lots max_positions sl_points tp_points be_trigger trail_step time_limit_on max_hold_secs",
        "trend": "lots max_positions sl_points be1_trigger be2_trigger be2_lock be3_trigger be3_lock reduce_percent trail_trigger trail_step",
        "moat": "enable p1_trigger p1_percent p2_trigger p2_amount liquidation shutdown",
        "sync": "enable api_base_url sync_interval_min request_timeout_ms max_batch_size debug",
    }
    settings_body = {group: {name: 1 for name in names.split()} for group, names in fields.items()}
    for group, name in [("basic", "use_session"), ("basic", "export_on_reset"),
                        ("risk", "enable_circuit_breaker"), ("risk", "alert_on_breaker"),
                        ("scalp", "time_limit_on"), ("moat", "enable"), ("sync", "enable"), ("sync", "debug")]:
        settings_body[group][name] = True
    settings_body["basic"].update(comment_scalp="TradeEZ-SC", comment_trend="TradeEZ-TR")
    settings_body["sync"]["api_base_url"] = "http://127.0.0.1:8000"
    assert sum(len(group) for group in settings_body.values()) == 55
    payloads = {
        "symbols": {"symbols": [{"name": "GOLD#", "digits": 2, "point": .01, "tick_value": 0, "contract_size": 100}]},
        "snapshots": {"snapshots": [{"balance": 100, "equity": 90, "margin": 10, "free_margin": 80, "snapshot_time": now}]},
        "settings": {"snapshot_time": now, "settings": settings_body},
        "heartbeat": {},
    }
    for endpoint, body in payloads.items():
        response = signed_post(client, "/api/v1/ingest/" + endpoint, token, {"mt5_login": login, **body})
        assert response.status_code == 200, response.text
    # Whitespace, field order and non-ASCII comments are signed exactly as transmitted.
    record = deal(6002, position=6002, entry=1, deal_type=1, open_time=100, deal_time=120)
    record["comment"] = '测试 "成交" \\'
    raw = json.dumps({"deals": [record], "mt5_login": login}, indent=2, ensure_ascii=False).encode("utf-8")
    timestamp = str(now)
    signature = hmac.new(token.encode(), raw + timestamp.encode(), hashlib.sha256).hexdigest()
    headers = {"Authorization": "Bearer " + token, "X-Timestamp": timestamp,
               "X-Signature": signature, "Content-Type": "application/json"}
    assert client.post("/api/v1/ingest/deals", content=raw, headers=headers).status_code == 200
    assert client.post("/api/v1/ingest/deals", content=raw + b" ", headers=headers).status_code == 401


def test_sop_snapshots_replay_conflict_and_manual_settings(client, db):
    login = 310004
    token = make_account(db, login)
    now = int(time.time()) - 120
    def post(endpoint, body):
        return signed_post(client, "/api/v1/ingest/" + endpoint, token, {"mt5_login": login, **body})
    snap = {"balance": 100, "equity": 90, "margin": 10, "free_margin": 80, "snapshot_time": now}
    assert post("snapshots", {"snapshots": [snap]}).status_code == 200
    assert post("snapshots", {"snapshots": [snap]}).status_code == 200
    assert post("snapshots", {"snapshots": [{**snap, "snapshot_time": now + 1}, {**snap, "equity": 99}]}).status_code == 409
    assert db.execute("SELECT COUNT(*) FROM snapshots WHERE account_login=?", (login,)).fetchone()[0] == 1
    def setting(when, enabled):
        return post("settings", {"snapshot_time": when, "settings": {"sync": {"enable": enabled}}})
    assert setting(now, True).status_code == 200
    assert setting(now, True).status_code == 200
    assert setting(now, False).status_code == 409
    assert setting(now + 1, False).status_code == 200
    assert setting(now - 1, False).status_code == 200
    assert db.execute("SELECT COUNT(*) FROM ea_settings_history WHERE account_login=?", (login,)).fetchone()[0] == 3


def test_large_account_login_roundtrips_without_float(client, db):
    headers = web_headers(db, "large-login@example.com")
    login = 9007199254740997
    created = client.post("/api/v1/accounts", headers=headers,
                          json={"mt5_login": str(login), "broker_server": "Test", "sync_start_time": 0})
    assert created.status_code == 201, created.text
    assert created.json()["mt5_login"] == str(login)
    assert signed_post(client, "/api/v1/ingest/heartbeat", created.json()["sync_key"], {"mt5_login": login}).status_code == 200
    for invalid in (True, float(login), "9223372036854775808"):
        assert client.post("/api/v1/accounts", headers=headers,
                           json={"mt5_login": invalid, "broker_server": "Test", "sync_start_time": 0}).status_code == 400


def test_trade_projection_replay_correction_pagination_and_ownership(client, db):
    login = 390001
    token = make_account(db, login)
    user = db.execute("SELECT * FROM users WHERE email='tester@example.com'").fetchone()
    headers = {"Authorization": "Bearer " + create_access_token(user, settings)}
    stranger = web_headers(db, "trade-stranger@example.com")
    account_id = db.execute("SELECT id FROM accounts WHERE mt5_login=?", (login,)).fetchone()[0]
    rows = [deal(8101, position=81, entry=0, deal_type=0, open_time=100, deal_time=100, volume=1),
            deal(8102, position=81, entry=2, deal_type=1, open_time=100, deal_time=200, volume=1.5),
            deal(8103, position=81, entry=1, deal_type=0, open_time=100, deal_time=300, volume=.5)]
    def upload(values):
        return signed_post(client, "/api/v1/ingest/deals", token, {"mt5_login": login, "deals": values})
    def query(page=1):
        response = client.get(f"/api/v1/my/orders?account_id={account_id}&page_size=1&page={page}&sort=open_time_asc", headers=headers)
        assert response.status_code == 200, response.text
        return response.json()
    assert upload(rows).status_code == 200
    assert db.execute("SELECT COUNT(*) FROM trade_dirty_positions WHERE account_login=?", (login,)).fetchone()[0] == 1
    first = query()
    second = query(2)
    assert first["total"] == 2
    first_id, second_id = first["items"][0]["trade_id"], second["items"][0]["trade_id"]
    assert first_id != second_id
    assert query(3)["items"] == []
    assert upload(rows).json()["duplicates"] == 3
    assert query()["items"][0]["trade_id"] == first_id
    detail_path = f"/api/v1/my/trades/{first_id}"
    detail = client.get(detail_path, headers=headers).json()
    assert detail["total"] == 2
    assert detail["allocations"][1]["method"] == "reversal_volume_proportion"
    assert client.get(detail_path, headers=stranger).status_code == 404
    assert client.get(detail_path).status_code == 401
    assert upload([{**rows[-1], "profit": 42}]).status_code == 200
    changed = query(2)["items"][0]
    assert changed["trade_id"] == second_id
    assert changed["net_pnl"] > second["items"][0]["net_pnl"]
    # Moving a corrected fact invalidates both its old and new position.
    assert upload([{**rows[-1], "position_id": 82}]).status_code == 200
    assert query()["total"] == 3
    db.execute("DELETE FROM deals WHERE account_login=? AND position_id=82", (login,))
    db.commit()
    assert query()["total"] == 2


def test_trade_rebuild_is_atomic_and_late_opening_repairs_review(client, db, monkeypatch):
    from app.trades import projection
    login = 320002
    token = make_account(db, login)
    user = db.execute("SELECT * FROM users WHERE email='tester@example.com'").fetchone()
    headers = {"Authorization": "Bearer " + create_access_token(user, settings)}
    account_id = db.execute("SELECT id FROM accounts WHERE mt5_login=?", (login,)).fetchone()[0]
    rows = [deal(8201 + n, position=91 + n, entry=1, deal_type=1, open_time=100, deal_time=200) for n in range(2)]
    assert signed_post(client, "/api/v1/ingest/deals", token, {"mt5_login": login, "deals": rows}).status_code == 200
    original = projection.build_lifecycles
    calls = 0
    def failing_builder(*args):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("injected rebuild failure")
        return original(*args)
    with monkeypatch.context() as patch:
        patch.setattr(projection, "build_lifecycles", failing_builder)
        with pytest.raises(RuntimeError, match="injected rebuild failure"):
            projection.refresh(db, user["id"])
    assert db.execute("SELECT COUNT(*) FROM trade_lifecycles WHERE account_id=?", (account_id,)).fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM trade_dirty_positions WHERE account_login=?", (login,)).fetchone()[0] == 2
    path = f"/api/v1/my/orders?account_id={account_id}"
    before = client.get(path + "&status=needs_review", headers=headers).json()
    assert before["total"] == 2
    opening = deal(8199, position=91, entry=0, deal_type=0, open_time=100, deal_time=100)
    assert signed_post(client, "/api/v1/ingest/deals", token, {"mt5_login": login, "deals": [opening]}).status_code == 200
    after = client.get(path, headers=headers).json()
    assert after["total"] == 2
    repaired = next(item for item in after["items"] if item["position_id"] == 91)
    assert repaired["is_closed"] and repaired["open_time"] == 100
    assert client.get(path + "&status=needs_review", headers=headers).json()["total"] == 1


def test_full_batch_handshake_confirms_cursor_and_orders_are_visible(client, db):
    login = 100001
    token = make_account(db, login)
    open_time = int(time.time()) - 86400
    deals = [
        deal(1001, position=2001, entry=0, deal_type=0, open_time=open_time, deal_time=open_time),
        deal(1002, position=2001, entry=1, deal_type=1, open_time=open_time, deal_time=open_time + 60),
    ]

    handshake = signed_post(client, "/api/v1/sync/last_sync_time", token, {"mt5_login": login})
    assert handshake.status_code == 200, handshake.text
    run_id = handshake.json()["sync_run_id"]
    assert "batch_handshake_v2" in handshake.json()["capabilities"]

    batch_id = "batch-0001-complete"
    request_hash = hashlib.sha256(
        json.dumps(deals, separators=(",", ":"), sort_keys=True).encode()
    ).hexdigest()
    uploaded = signed_post(
        client,
        "/api/v1/ingest/deals",
        token,
        {
            "mt5_login": login,
            "server_gmt_off": 0,
            "deals": deals,
            "sync_run_id": run_id,
            "batch_id": batch_id,
            "batch_index": 0,
            "batch_count": 1,
            "instance_id": "ea-unit-1",
            "protocol_version": "2.2",
            "request_hash": request_hash,
        },
    )
    assert uploaded.status_code == 200, uploaded.text
    upload_data = uploaded.json()
    assert upload_data["accepted"] == 2
    assert upload_data["inserted"] == 2
    assert upload_data["batch_status"] == "received"

    retried = signed_post(
        client,
        "/api/v1/ingest/deals",
        token,
        {
            "mt5_login": login,
            "server_gmt_off": 0,
            "deals": deals,
            "sync_run_id": run_id,
            "batch_id": batch_id,
            "batch_index": 0,
            "batch_count": 1,
            "request_hash": request_hash,
        },
    )
    assert retried.status_code == 200, retried.text
    assert retried.json()["replayed"] is True
    assert retried.json()["inserted"] == 0
    assert retried.json()["duplicates"] == 2
    assert db.execute("SELECT COUNT(*) FROM deals WHERE account_login=?", (login,)).fetchone()[0] == 2

    confirmed = signed_post(
        client,
        "/api/v1/sync/update_last_sync_time",
        token,
        {
            "mt5_login": login,
            "last_sync_time": open_time + 60,
            "sync_run_id": run_id,
            "batch_count": 1,
            "deal_count": 2,
        },
    )
    assert confirmed.status_code == 200, confirmed.text
    confirmation = confirmed.json()
    assert confirmation["handshake_confirmed"] is True
    assert confirmation["updated"] is True
    assert confirmation["checksum_valid"] is True
    assert db.execute("SELECT status FROM sync_runs WHERE id=?", (run_id,)).fetchone()[0] == "committed"

    user = db.execute("SELECT * FROM users WHERE email=?", ("tester@example.com",)).fetchone()
    user_token = create_access_token(user, settings)
    account = db.execute("SELECT id FROM accounts WHERE mt5_login=?", (login,)).fetchone()
    run_detail = client.get(
        f"/api/v1/my/sync-runs/{run_id}?page_size=1",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert run_detail.status_code == 200, run_detail.text
    detail_data = run_detail.json()
    assert detail_data["run"]["status"] == "committed"
    assert detail_data["total"] == 1
    assert detail_data["batches"][0]["retries"] == 1
    assert detail_data["batches"][0]["item_count"] == 2
    assert detail_data["batches"][0]["batch_id"] == batch_id
    assert not {"raw_json", "payload_hash", "request_hash"} & detail_data["batches"][0].keys()
    stranger = web_headers(db, "batch-outsider@example.com")
    assert client.get(f"/api/v1/my/sync-runs/{run_id}", headers=stranger).status_code == 404
    assert client.get(f"/api/v1/my/sync-runs/{run_id}").status_code == 401
    assert client.get(f"/api/v1/my/sync-runs/{run_id}?page_size=101", headers={"Authorization": f"Bearer {user_token}"}).status_code == 400
    assert client.get(f"/api/v1/my/sync-runs/{run_id}?page=2", headers={"Authorization": f"Bearer {user_token}"}).json()["batches"] == []
    source = client.get(
        f"/api/v1/my/accounts/{account['id']}/deals/1001?page_size=1",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert source.status_code == 200, source.text
    assert source.json()["source_total"] == 1  # Retried batches do not duplicate references.
    assert source.json()["source_batches"][0]["batch_id"] == batch_id
    assert source.json()["source_batches"][0]["sync_run_id"] == run_id
    next_page = client.get(
        f"/api/v1/my/accounts/{account['id']}/deals/1001?page_size=1&page=2",
        headers={"Authorization": f"Bearer {user_token}"},
    ).json()
    assert next_page["source_total"] == 1
    assert next_page["source_batches"] == []
    orders = client.get(
        f"/api/v1/my/orders?account_id={account['id']}",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert orders.status_code == 200, orders.text
    order_data = orders.json()
    assert order_data["total"] == 1
    order = order_data["items"][0]
    assert order["position_id"] == 2001
    assert order["hold_seconds"] == 60
    assert order["sl_price"] == 1990.0
    assert order["tp_price"] == 2020.0
    assert order["swap_total"] == -1.0
    assert order["commission_total"] == -0.5

    account_response = client.get(
        f"/api/v1/accounts/{account['id']}",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert account_response.json()["synced_order_count"] == 1


def test_missing_batch_is_rejected_and_does_not_advance_cursor(client, db):
    login = 100002
    token = make_account(db, login)
    handshake = signed_post(client, "/api/v1/sync/last_sync_time", token, {"mt5_login": login})
    run_id = handshake.json()["sync_run_id"]
    response = signed_post(
        client,
        "/api/v1/sync/update_last_sync_time",
        token,
        {
            "mt5_login": login,
            "last_sync_time": int(time.time()),
            "sync_run_id": run_id,
            "batch_count": 1,
            "deal_count": 0,
        },
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "SYNC_BATCHES_MISSING"
    row = db.execute("SELECT a.last_sync_time, r.status FROM accounts a JOIN sync_runs r ON r.account_id=a.id WHERE r.id=?", (run_id,)).fetchone()
    assert row["last_sync_time"] == 0
    assert row["status"] == "open"


def test_legacy_ea_without_batch_fields_remains_supported(client, db):
    login = 100003
    token = make_account(db, login)
    open_time = int(time.time()) - 7200
    handshake = signed_post(client, "/api/v1/sync/last_sync_time", token, {"mt5_login": login})
    assert handshake.status_code == 200, handshake.text
    legacy_run_id = handshake.json()["sync_run_id"]

    payload = {
        "mt5_login": login,
        "server_gmt_off": 0,
        "deals": [deal(3001, position=4001, entry=1, deal_type=1, open_time=open_time - 60, deal_time=open_time)],
    }
    uploaded = signed_post(client, "/api/v1/ingest/deals", token, payload)
    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.json()["accepted"] == 1
    confirmed = signed_post(
        client,
        "/api/v1/sync/update_last_sync_time",
        token,
        {"mt5_login": login, "last_sync_time": open_time},
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["handshake_confirmed"] is False
    assert confirmed.json()["updated"] is True
    legacy_run = db.execute("SELECT status, cursor_end FROM sync_runs WHERE id=?", (legacy_run_id,)).fetchone()
    assert legacy_run["status"] == "committed"
    assert legacy_run["cursor_end"] == open_time

    no_new_handshake = signed_post(client, "/api/v1/sync/last_sync_time", token, {"mt5_login": login})
    assert no_new_handshake.status_code == 200, no_new_handshake.text
    no_new_run_id = no_new_handshake.json()["sync_run_id"]
    no_new_confirm = signed_post(
        client,
        "/api/v1/sync/update_last_sync_time",
        token,
        {"mt5_login": login, "last_sync_time": open_time},
    )
    assert no_new_confirm.status_code == 200, no_new_confirm.text
    assert no_new_confirm.json()["updated"] is False
    no_new_run = db.execute("SELECT status, cursor_end FROM sync_runs WHERE id=?", (no_new_run_id,)).fetchone()
    assert no_new_run["status"] == "committed"
    assert no_new_run["cursor_end"] == open_time
    assert db.execute("SELECT last_success_sync_at FROM accounts WHERE mt5_login=?", (login,)).fetchone()["last_success_sync_at"]


def test_disabled_account_cannot_synchronize(client, db):
    login = 100004
    token = make_account(db, login, status="disabled")
    response = signed_post(client, "/api/v1/sync/last_sync_time", token, {"mt5_login": login})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ACCOUNT_DISABLED"


def test_expired_run_cannot_write_deals(client, db):
    login = 100010
    token = make_account(db, login)
    first = signed_post(client, "/api/v1/sync/last_sync_time", token, {"mt5_login": login}).json()
    signed_post(client, "/api/v1/sync/last_sync_time", token, {"mt5_login": login})
    now = int(time.time()) - 60
    response = signed_post(client, "/api/v1/ingest/deals", token, {
        "mt5_login": login, "server_gmt_off": 0,
        "sync_run_id": first["sync_run_id"], "batch_id": "expired-run-batch",
        "batch_index": 0, "batch_count": 1,
        "deals": [deal(10010, position=10010, entry=0, deal_type=0, open_time=now, deal_time=now)],
    })
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "SYNC_RUN_CLOSED"
    assert db.execute("SELECT COUNT(*) FROM deals WHERE account_login=?", (login,)).fetchone()[0] == 0


def test_batch_storage_failure_rolls_back_all_rows(client, db):
    from app.sync.service import ingest_deals_v21
    from app.v2_models import IngestDealsRequest

    login = 100011
    token = make_account(db, login)
    run = signed_post(client, "/api/v1/sync/last_sync_time", token, {"mt5_login": login}).json()
    account = db.execute("SELECT * FROM accounts WHERE mt5_login=?", (login,)).fetchone()
    now = int(time.time()) - 60
    payload = IngestDealsRequest.model_validate({
        "mt5_login": login, "server_gmt_off": 0,
        "sync_run_id": run["sync_run_id"], "batch_id": "rollback-batch",
        "batch_index": 0, "batch_count": 1,
        "deals": [deal(t, position=t, entry=0, deal_type=0, open_time=now, deal_time=now) for t in (11001, 11002)],
    })
    db.execute("CREATE TEMP TRIGGER fail_second_deal BEFORE INSERT ON deals WHEN NEW.ticket=11002 BEGIN SELECT RAISE(ABORT, 'injected failure'); END")
    try:
        with pytest.raises(sqlite3.IntegrityError, match="injected failure"):
            ingest_deals_v21(payload, account, db)
    finally:
        db.execute("DROP TRIGGER fail_second_deal")
    assert not db.in_transaction
    assert db.execute("SELECT COUNT(*) FROM deals WHERE account_login=?", (login,)).fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM sync_batches WHERE sync_run_id=?", (run["sync_run_id"],)).fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM sync_batch_refs WHERE account_login=?", (login,)).fetchone()[0] == 0
    assert db.execute("SELECT received_batch_count FROM sync_runs WHERE id=?", (run["sync_run_id"],)).fetchone()[0] == 0


def test_cursor_uses_locked_state_instead_of_stale_authentication(client, db):
    from app.sync.service import update_last_sync_time
    from app.v2_models import UpdateLastSyncTimeRequest

    login = 100012
    make_account(db, login)
    stale = db.execute("SELECT * FROM accounts WHERE mt5_login=?", (login,)).fetchone()
    now = int(time.time()) - 60
    db.execute("UPDATE accounts SET last_sync_time=? WHERE mt5_login=?", (now, login))
    db.commit()
    response = update_last_sync_time(UpdateLastSyncTimeRequest(mt5_login=login, last_sync_time=now-1), stale, db)
    assert response.last_sync_time == now
    assert response.updated is False
    assert db.execute("SELECT last_sync_time FROM accounts WHERE mt5_login=?", (login,)).fetchone()[0] == now


@pytest.mark.parametrize("path,extra", [
    ("/sync/last_sync_time", {}),
    ("/sync/update_last_sync_time", {"last_sync_time": 0}),
    ("/ingest/heartbeat", {}),
    ("/ingest/symbols", {"symbols": [{"name": "XAUUSD", "digits": 2, "point": .01, "tick_value": 1, "contract_size": 100}]}),
    ("/ingest/snapshots", {"snapshots": [{"balance": 1, "equity": 1, "margin": 0, "free_margin": 1, "snapshot_time": 1}]}),
    ("/ingest/settings", {"snapshot_time": 1, "settings": {"general": {"enabled": True}}}),
    ("/ingest/deals", {"server_gmt_off": 0, "deals": [deal(12001, position=12001, entry=0, deal_type=0, open_time=1, deal_time=1)]}),
])
def test_all_sync_endpoints_reject_disabled_accounts(client, db, path, extra):
    login = 100020
    if db.execute("SELECT 1 FROM accounts WHERE mt5_login=?", (login,)).fetchone() is None:
        make_account(db, login, status="disabled")
    token = f"sk_live_{login}_abcdefghijklmnopqrstuvwxyz0123456789ABCD"
    response = signed_post(client, "/api/v1" + path, token, {"mt5_login": login, **extra})
    assert response.status_code == 403, response.text
    assert response.json()["error"]["code"] == "ACCOUNT_DISABLED"


def test_api_logs_keep_counts_but_not_order_details(client, db):
    login = 100001
    user = db.execute("SELECT * FROM users WHERE email=?", ("tester@example.com",)).fetchone()
    user_token = create_access_token(user, settings)
    response = client.get(
        f"/api/v1/my/api-logs?limit=20&mt5_login={login}",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert response.status_code == 200, response.text
    logs = response.json()
    assert logs
    # Timestamps and generated IDs can incidentally contain digits such as 2020;
    # the privacy assertion is limited to fields that could carry a request payload.
    serializable_fields = ("method", "path", "action", "error_code", "error_message")
    serialized = json.dumps(
        [{field: log.get(field) for field in serializable_fields} for log in logs],
        ensure_ascii=False,
    )
    assert "XAUUSD" not in serialized
    assert "1990" not in serialized
    assert "2020" not in serialized
    ingest_logs = [log for log in logs if log["action"] == "ingest_deals" and log.get("sync_run_id")]
    assert ingest_logs
    assert any(log["inserted_count"] == 2 for log in ingest_logs)

def test_performance_dates_fees_filters_ownership_and_corrections(client, db):
    from datetime import datetime, timezone
    login = 320001
    key = make_account(db, login)
    account = db.execute("SELECT * FROM accounts WHERE mt5_login=?", (login,)).fetchone()
    user = db.execute("SELECT * FROM users WHERE id=?", (account["user_id"],)).fetchone()
    headers = {"Authorization": "Bearer " + create_access_token(user, settings)}
    midnight = int(datetime(2026, 9, 2, tzinfo=timezone.utc).timestamp())
    records = []
    for index, closed in enumerate((midnight-1, midnight, midnight+86400)):
        records.extend([deal(320010+index*2, position=320010+index, entry=0, deal_type=0,
                             open_time=closed-100, deal_time=closed-100),
                        deal(320011+index*2, position=320010+index, entry=1, deal_type=1,
                             open_time=closed-100, deal_time=closed)])
    records.append(deal(320020, position=320020, entry=0, deal_type=0, open_time=midnight, deal_time=midnight))
    records.append(deal(320021, position=320021, entry=1, deal_type=1, open_time=midnight, deal_time=midnight))
    assert signed_post(client, "/api/v1/ingest/deals", key, {"mt5_login": login, "deals": records}).status_code == 200
    params = dict(account_id=account["id"], start_date="2026-09-02", end_date="2026-09-02")
    def query(**extra):
        return client.get("/api/v1/my/performance", headers=headers, params={**params, **extra})
    result = query()
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["summary"]["count"] == 1
    assert data["summary"]["net_pnl"] == 8.5  # both opening and closing fees
    assert data["days"][0]["date"] == "2026-09-02"
    assert data["days"][0]["trades"][0]["trade_id"] > 0
    assert data["excluded"] == {"partial": 1, "needs_review": 1}
    assert query(symbol="EUR").json()["summary"]["count"] == 0
    assert query(direction="sell").json()["summary"]["count"] == 0
    assert query(start_date="2026-09-03").status_code == 422
    assert query(end_date="9999-12-31").status_code == 422
    assert client.get("/api/v1/my/performance", params=params).status_code == 401
    stranger = web_headers(db, "performance-stranger@example.com")
    assert client.get("/api/v1/my/performance", headers=stranger, params=params).status_code == 404
    records[3]["profit"] = -10
    assert signed_post(client, "/api/v1/ingest/deals", key, {"mt5_login": login, "deals": [records[3]]}).status_code == 200
    assert query().json()["summary"]["net_pnl"] == -11.5


def test_account_configuration_and_initial_cursor(client, db):
    headers = web_headers(db, "configuration@example.com")
    login = 410001
    payload = {"mt5_login": login, "broker_server": " Server ", "sync_start_time": int(time.time()) - 86400,
               "account_currency": " usd ", "server_timezone_name": "Europe/Helsinki", "label": " Demo "}
    assert client.post("/api/v1/accounts", headers=headers, json={k: v for k, v in payload.items() if k != "sync_start_time"}).status_code == 400
    for invalid in (True, 1.5, int(time.time()) + 86400):
        assert client.post("/api/v1/accounts", headers=headers, json={**payload, "sync_start_time": invalid}).status_code == 400
    response = client.post("/api/v1/accounts", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["sync_start_locked"] is False
    assert (created["label"], created["broker_server"], created["account_currency"]) == ("Demo", "Server", "USD")
    path = f"/api/v1/accounts/{created['id']}"
    initial = payload["sync_start_time"] - 86400
    updated = client.patch(path, headers=headers, json={"sync_start_time": initial, "label": None,
                                                       "account_currency": " usc ", "server_timezone_name": "UTC"})
    assert updated.status_code == 200, updated.text
    assert updated.json()["label"] is None and updated.json()["account_currency"] == "USC"
    for bad in ({"broker_server": "  "}, {"broker_server": None}, {"server_timezone_name": "Not/AZone"}, {"status": None}):
        assert client.patch(path, headers=headers, json=bad).status_code == 400
    key = created["sync_key"]
    handshake = signed_post(client, "/api/v1/sync/last_sync_time", key, {"mt5_login": login}).json()
    assert handshake["last_sync_time"] == initial
    locked_account = client.get(path, headers=headers).json()
    assert locked_account["sync_start_locked"] is True
    assert locked_account["deal_count"] == 0 and locked_account["last_sync_time"] == 0
    assert db.execute("SELECT cursor_start FROM sync_runs WHERE id=?", (handshake["sync_run_id"],)).fetchone()[0] == initial
    assert client.patch(path, headers=headers, json={"sync_start_time": initial - 1}).status_code == 409
    confirmed = signed_post(client, "/api/v1/sync/update_last_sync_time", key, {"mt5_login": login, "last_sync_time": initial})
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["last_sync_time"] == initial
    # A metadata-only patch must not rewind the cursor or rotate the key.
    result = client.patch(path, headers=headers, json={"account_currency": None, "server_timezone_name": None}).json()
    assert result["last_sync_time"] == initial and result["key_prefix"] == created["key_prefix"]
    assert result["account_currency"] is None and result["server_timezone_name"] is None
    other = web_headers(db, "configuration-other@example.com")
    assert client.patch(path, headers=other, json={"label": "No"}).status_code == 404


def test_settings_query_redacts_credentials(client, db):
    login = 410002
    key = make_account(db, login)
    user = db.execute("SELECT * FROM users WHERE email='tester@example.com'").fetchone()
    headers = {"Authorization": "Bearer " + create_access_token(user, settings)}
    account_id = db.execute("SELECT id FROM accounts WHERE mt5_login=?", (login,)).fetchone()[0]
    payload = {"mt5_login": login, "snapshot_time": 100, "settings": {
        "sync": {"Inp_SecretKey": "do-not-return-this", "timeout": 800},
        "nested": {"items": [{"password": "also-hidden", "magic": 9007199254740997}]}}}
    assert signed_post(client, "/api/v1/ingest/settings", key, payload).status_code == 200
    result = client.get(f"/api/v1/my/accounts/{account_id}/settings", headers=headers)
    assert result.status_code == 200
    assert "do-not-return-this" not in result.text and "also-hidden" not in result.text
    assert result.json()[0]["settings"]["sync"]["timeout"] == 800
    assert result.json()[0]["settings"]["nested"]["items"][0]["magic"] == "9007199254740997"


def test_account_reset_and_delete_fence_old_requests(client, db):
    from app.sync.repository import begin_account_write
    login = 420001
    old_key = make_account(db, login)
    account = db.execute("SELECT * FROM accounts WHERE mt5_login=?", (login,)).fetchone()
    user = db.execute("SELECT * FROM users WHERE id=?", (account["user_id"],)).fetchone()
    headers = {"Authorization": "Bearer " + create_access_token(user, settings)}
    path = f"/api/v1/accounts/{account['id']}"
    rows = [deal(42001, position=42001, entry=0, deal_type=0, open_time=100, deal_time=100),
            deal(42002, position=42001, entry=1, deal_type=1, open_time=100, deal_time=200)]
    assert signed_post(client, "/api/v1/ingest/deals", old_key, {"mt5_login": login, "deals": rows}).status_code == 200
    preview = client.get(path + "/maintenance-preview", headers=headers).json()
    assert preview["counts"]["deals"] == 2 and preview["counts"]["trade_lifecycles"] == 1
    payload = dict(confirm_login=str(login), revision=preview["revision"], sync_start_time=50)
    assert client.post(path + "/reset-sync", headers=headers, json={**payload, "confirm_login": "wrong"}).status_code == 400
    stranger = web_headers(db, "maintenance-stranger@example.com")
    assert client.get(path + "/maintenance-preview", headers=stranger).status_code == 404
    assert client.post(path + "/reset-sync", headers=stranger, json=payload).status_code == 404
    # Same-count source correction must invalidate the preview.
    rows[1]["profit"] = 12
    signed_post(client, "/api/v1/ingest/deals", old_key, {"mt5_login": login, "deals": [rows[1]]})
    assert client.post(path + "/reset-sync", headers=headers, json=payload).status_code == 409
    payload["revision"] = client.get(path + "/maintenance-preview", headers=headers).json()["revision"]
    reset = client.post(path + "/reset-sync", headers=headers, json=payload)
    assert reset.status_code == 200, reset.text
    result = reset.json()
    assert result["resync_pending"] and result["deal_count"] == 0
    assert result["sync_start_time"] == 50 and result["last_sync_time"] == 0
    new_key = result["sync_key"]
    assert new_key != old_key
    with pytest.raises(ApiError):
        begin_account_write(db, account)  # Request authenticated before reset.
    db.rollback()
    assert signed_post(client, "/api/v1/ingest/deals", old_key, {"mt5_login": login, "deals": rows}).status_code == 401
    stats = client.get("/api/v1/my/performance", headers=headers, params={"account_id": account["id"], "start_date": "1970-01-01", "end_date": "1970-01-02"}).json()
    assert stats["resync_pending"] is True
    assert signed_post(client, "/api/v1/sync/last_sync_time", new_key, {"mt5_login": login}).json()["last_sync_time"] == 50
    assert signed_post(client, "/api/v1/sync/update_last_sync_time", new_key, {"mt5_login": login, "last_sync_time": 50}).status_code == 200
    assert client.get(path, headers=headers).json()["resync_pending"] is False
    assert signed_post(client, "/api/v1/ingest/deals", new_key, {"mt5_login": login, "deals": rows}).status_code == 200
    preview = client.get(path + "/maintenance-preview", headers=headers).json()
    deletion = {"confirm_login": str(login), "revision": preview["revision"]}
    assert client.request("DELETE", path, headers=stranger, json=deletion).status_code == 404
    assert client.request("DELETE", path, headers=headers, json=deletion).status_code == 200
    assert client.get(path, headers=headers).status_code == 404
    assert signed_post(client, "/api/v1/ingest/deals", new_key, {"mt5_login": login, "deals": rows}).status_code == 401
    assert db.execute("SELECT COUNT(*) FROM deals WHERE account_login=?", (login,)).fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM api_logs WHERE account_id=? OR mt5_login=?", (account["id"], login)).fetchone()[0] == 0
    assert db.execute("PRAGMA foreign_key_check").fetchall() == []


def test_account_reset_failure_rolls_back_facts_and_key(client, db):
    from app.accounts.maintenance import execute, preview
    from app.schemas import AccountResetIn
    login = 420002
    key = make_account(db, login)
    account = db.execute("SELECT * FROM accounts WHERE mt5_login=?", (login,)).fetchone()
    user = db.execute("SELECT * FROM users WHERE id=?", (account["user_id"],)).fetchone()
    signed_post(client, "/api/v1/ingest/deals", key, {"mt5_login": login, "deals": [deal(42003, position=42003, entry=0, deal_type=0, open_time=100, deal_time=100)]})
    scope = preview(db, user, account["id"])
    db.execute("CREATE TEMP TRIGGER reject_reset BEFORE UPDATE ON accounts BEGIN SELECT RAISE(ABORT,'injected reset failure'); END")
    try:
        with pytest.raises(sqlite3.IntegrityError):
            execute(db, user, account["id"], AccountResetIn(confirm_login=str(login), revision=scope["revision"], sync_start_time=50), reset=True)
    finally:
        db.execute("DROP TRIGGER reject_reset")
    assert db.execute("SELECT key_hash FROM accounts WHERE id=?", (account["id"],)).fetchone()[0] == account["key_hash"]
    assert db.execute("SELECT COUNT(*) FROM deals WHERE account_login=?", (login,)).fetchone()[0] == 1
    assert not db.in_transaction


def test_review_filters_paginate_and_validate(client, db):
    headers = web_headers(db, "review-filter@example.com")
    accounts = []
    for login in (430101, 430102):
        response = client.post("/api/v1/accounts", headers=headers, json={"mt5_login": login, "broker_server": "Test", "sync_start_time": 0})
        assert response.status_code == 201
        accounts.append(response.json()["id"])
    for index in range(4):
        db.execute("""INSERT INTO trade_reviews(account_id,position_id,anchor_ticket,status,notes,tags_json,source_hash,revision)
                      VALUES(?,?,?,?,?,?,?,1)""",
                   (accounts[index % 2], 99000 + index, 99000 + index, "draft", "复盘 Test 100%_", '["追单"]', "a" * 64))
    db.commit()
    path = "/api/v1/my/reviews"
    tag_path = "/api/v1/my/review-tags"
    assert client.get(tag_path).status_code == 401
    assert client.get(tag_path, headers=headers).json()["items"] == [{"name": "追单", "review_count": 4}]
    assert client.get(tag_path, headers=headers, params={"account_id": accounts[0]}).json()["items"] == [{"name": "追单", "review_count": 2}]
    stranger = web_headers(db, "tags-stranger@example.com")
    assert client.get(tag_path, headers=stranger, params={"account_id": accounts[0]}).json()["total"] == 0
    assert client.get(tag_path, headers=headers, params={"q": "%"}).json()["total"] == 0
    assert client.get(tag_path, headers=headers, params={"q": "追"}).json()["total"] == 1
    db.execute("UPDATE trade_reviews SET tags_json=? WHERE account_id=?", ('["追单", "追单", "复盘", "Test"]', accounts[0]))
    db.commit()
    first_tags = client.get(tag_path, headers=headers, params={"page_size": 1}).json()
    next_tags = client.get(tag_path, headers=headers, params={"page_size": 1, "page": 2}).json()
    assert first_tags["total"] == next_tags["total"] == 3
    assert first_tags["items"] == [{"name": "追单", "review_count": 4}]
    assert next_tags["items"] == [{"name": "Test", "review_count": 2}]
    assert client.get(tag_path, headers=headers, params={"q": "test"}).json()["total"] == 1
    assert client.get(tag_path, headers=headers, params={"q": "x" * 41}).status_code == 400
    params = {"account_id": accounts[0], "tag": " 追单 ", "q": "test", "status": "draft", "association": "orphan", "page_size": 1}
    first = client.get(path, headers=headers, params=params).json()
    second = client.get(path, headers=headers, params={**params, "page": 2}).json()
    assert first["total"] == second["total"] == 2
    assert len(first["items"]) == len(second["items"]) == 1
    assert first["items"][0]["id"] != second["items"][0]["id"]
    assert client.get(path, headers=headers, params={**params, "page": 3}).json()["items"] == []
    assert client.get(path, headers=headers, params={**params, "q": "100%_"}).json()["total"] == 2
    assert client.get(path, headers=headers, params={"q": "' OR 1=1 --"}).json()["total"] == 0
    for invalid in ({"status": "unknown"}, {"association": "unknown"}, {"account_id": 0}, {"tag": "x" * 41}, {"q": "x" * 201}):
        assert client.get(path, headers=headers, params=invalid).status_code == 400


def test_reviews_survive_corrections_and_reset_with_revision_protection(client, db):
    login = 430001
    key = make_account(db, login)
    account = db.execute("SELECT * FROM accounts WHERE mt5_login=?", (login,)).fetchone()
    user = db.execute("SELECT * FROM users WHERE id=?", (account["user_id"],)).fetchone()
    headers = {"Authorization": "Bearer " + create_access_token(user, settings)}
    rows = [deal(43001, position=43001, entry=0, deal_type=0, open_time=100, deal_time=100),
            deal(43002, position=43001, entry=1, deal_type=1, open_time=100, deal_time=200)]
    def upload(sync_key, facts):
        response = signed_post(client, "/api/v1/ingest/deals", sync_key, {"mt5_login": login, "deals": facts})
        assert response.status_code == 200, response.text
    upload(key, rows)
    trade = client.get("/api/v1/my/orders", headers=headers, params={"account_id": account["id"]}).json()["items"][0]
    path = f"/api/v1/my/trades/{trade['trade_id']}/review"
    review = client.get(path, headers=headers).json()
    assert review["revision"] == 0 and review["notes"] == ""
    body = {"revision": 0, "source_hash": review["source_hash"], "status": "reviewed", "notes": "保留这份复盘", "tags": [" 追单 ", "追单", "改进"]}
    assert client.put(path, headers=headers, json=body).status_code == 200
    assert client.put(path, headers=headers, json=body).status_code == 409
    other = web_headers(db, "review-stranger@example.com")
    assert client.get(path, headers=other).status_code == 404
    assert client.put(path, headers=other, json=body).status_code == 404
    assert client.get("/api/v1/my/reviews", headers=other).json()["total"] == 0
    combined = {"account_id": account["id"], "status": "reviewed", "tag": "追单", "q": "保留", "association": "linked"}
    assert client.get("/api/v1/my/reviews", headers=headers, params=combined).json()["total"] == 1
    assert client.get("/api/v1/my/reviews", headers=other, params=combined).json()["total"] == 0
    for mismatch in ({"status": "draft"}, {"tag": "追"}, {"q": "%"}, {"association": "orphan"}):
        assert client.get("/api/v1/my/reviews", headers=headers, params={**combined, **mismatch}).json()["total"] == 0
    upload(key, rows)  # identical replay keeps the review valid
    current = client.get(path, headers=headers).json()
    assert current["source_changed"] is False and current["tags"] == ["追单", "改进"]
    rows[1]["profit"] = -8
    upload(key, [rows[1]])
    changed = client.get(path, headers=headers).json()
    assert changed["source_changed"] is True and changed["notes"] == body["notes"]
    assert client.put(path, headers=headers, json={**body, "revision": 1}).status_code == 409
    assert client.put(path, headers=headers, json={**body, "revision": 1, "source_hash": changed["source_hash"]}).status_code == 200
    account_path = f"/api/v1/accounts/{account['id']}"
    scope = client.get(account_path + "/maintenance-preview", headers=headers).json()
    assert scope["counts"]["trade_reviews"] == 1
    reset = client.post(account_path + "/reset-sync", headers=headers, json={"confirm_login": str(login), "revision": scope["revision"], "sync_start_time": 50})
    assert reset.status_code == 200, reset.text
    orphan = client.get("/api/v1/my/reviews", headers=headers).json()["items"][0]
    assert orphan["trade_id"] is None and orphan["notes"] == body["notes"]
    assert client.get("/api/v1/my/reviews", headers=headers, params={**combined, "association": "orphan"}).json()["total"] == 1
    assert client.get("/api/v1/my/reviews", headers=headers, params=combined).json()["total"] == 0
    upload(reset.json()["sync_key"], rows)
    recovered = client.get("/api/v1/my/reviews", headers=headers).json()["items"][0]
    assert recovered["trade_id"] is not None and recovered["notes"] == body["notes"]
    assert recovered["source_changed"] is False
    scope = client.get(account_path + "/maintenance-preview", headers=headers).json()
    assert client.request("DELETE", account_path, headers=headers, json={"confirm_login": str(login), "revision": scope["revision"]}).status_code == 200
    assert db.execute("SELECT COUNT(*) FROM trade_reviews WHERE account_id=?", (account["id"],)).fetchone()[0] == 0


def test_fixed_test_code_requires_request_and_is_consumed(client, db, monkeypatch):
    from app.web_auth import service
    monkeypatch.setattr(service.settings, "dev_fixed_login_code", "123456")
    monkeypatch.setattr(service, "send_verification_email", lambda *args: None)
    email = "fixed-test@example.com"
    assert client.post("/api/v1/auth/verify-code", json={"email": email, "code": "123456"}).status_code == 400
    sent = client.post("/api/v1/auth/send-code", json={"email": email})
    assert sent.status_code == 200 and "123456" in sent.json()["message"]
    assert client.post("/api/v1/auth/verify-code", json={"email": email, "code": "654321"}).status_code == 400
    assert client.post("/api/v1/auth/verify-code", json={"email": email, "code": "123456"}).status_code == 200
    assert client.post("/api/v1/auth/verify-code", json={"email": email, "code": "123456"}).status_code == 400


def test_deal_rate_limit_allows_full_sync_burst_but_keeps_legacy_limit():
    batch_identity = "rate-limit-batch"
    batch_key = f"deals_batch:{batch_identity}"
    _rate_buckets.pop(batch_key, None)
    for _ in range(300):
        check_rate_limit("deals_batch", batch_identity, 300)
    with pytest.raises(ApiError) as batch_exc:
        check_rate_limit("deals_batch", batch_identity, 300)
    assert batch_exc.value.status_code == 429

    legacy_identity = "rate-limit-legacy"
    legacy_key = f"deals:{legacy_identity}"
    _rate_buckets.pop(legacy_key, None)
    for _ in range(300):
        check_rate_limit("deals", legacy_identity, 300)
    with pytest.raises(ApiError) as legacy_exc:
        check_rate_limit("deals", legacy_identity, 300)
    assert legacy_exc.value.status_code == 429



def test_tag_rename_merge_is_scoped_atomic_and_revision_protected(client, db):
    owner = web_headers(db, "tag-change@example.com")
    other = web_headers(db, "tag-change-other@example.com")
    ids = []
    for login, headers in ((440001, owner), (440002, owner), (440003, other)):
        created = client.post("/api/v1/accounts", headers=headers, json={"mt5_login": login, "broker_server": "Test", "sync_start_time": 0})
        assert created.status_code == 201
        ids.append(created.json()["id"])
    for index, (account_id, tags) in enumerate(((ids[0], ["原标签", "目标", "保留"]), (ids[0], ["原标签"]), (ids[1], ["原标签"]), (ids[2], ["原标签"]))):
        db.execute("""INSERT INTO trade_reviews(account_id,position_id,anchor_ticket,status,notes,tags_json,source_hash,revision)
            VALUES(?,?,?,?,?,?,?,1)""", (account_id, 44001+index, 44001+index, "draft", "保留笔记", json.dumps(tags), "b"*64))
    db.commit()
    preview_path = "/api/v1/my/review-tags/change-preview"
    apply_path = "/api/v1/my/review-tags/change"
    body = {"source": "原标签", "target": "目标", "account_id": ids[0]}
    assert client.post(preview_path, json=body).status_code == 401
    assert client.post(preview_path, headers=other, json=body).status_code == 404
    for invalid in ({"target": "原标签"}, {"target": " "}, {"target": "a,b"}, {"target": "x"*41}):
        assert client.post(preview_path, headers=owner, json={**body, **invalid}).status_code == 400
    preview = client.post(preview_path, headers=owner, json=body).json()
    assert (preview["affected_reviews"], preview["affected_accounts"], preview["merged_reviews"], preview["target_reviews"]) == (2, 1, 1, 1)
    # A concurrent note edit invalidates preview even when tag counts have not changed.
    db.execute("UPDATE trade_reviews SET notes='更新笔记',revision=revision+1 WHERE account_id=? AND position_id=44001", (ids[0],))
    db.commit()
    assert client.post(apply_path, headers=owner, json={**body, "revision": preview["revision"]}).status_code == 409
    preview = client.post(preview_path, headers=owner, json=body).json()
    # Failure during the second update must roll back the first update as well.
    db.execute("""CREATE TEMP TRIGGER fail_tag_change BEFORE UPDATE ON trade_reviews
        WHEN OLD.position_id=44002 BEGIN SELECT RAISE(ABORT, 'test rollback'); END""")
    from app.trades import tag_maintenance
    user_id = db.execute("SELECT user_id FROM accounts WHERE id=?", (ids[0],)).fetchone()[0]
    with pytest.raises(sqlite3.IntegrityError):
        tag_maintenance.apply(db, user_id, tag_maintenance.TagApply(**body, revision=preview["revision"]))
    assert all("原标签" in json.loads(row[0]) for row in db.execute("SELECT tags_json FROM trade_reviews WHERE account_id=?", (ids[0],)))
    db.execute("DROP TRIGGER fail_tag_change")
    db.commit()
    result = client.post(apply_path, headers=owner, json={**body, "revision": preview["revision"]})
    assert result.status_code == 200 and result.json()["updated_reviews"] == 2
    rows = db.execute("SELECT * FROM trade_reviews WHERE account_id=? ORDER BY position_id", (ids[0],)).fetchall()
    assert json.loads(rows[0]["tags_json"]) == ["目标", "保留"]
    assert rows[0]["notes"] == "更新笔记" and rows[0]["revision"] == 3
    assert rows[1]["notes"] == "保留笔记" and rows[1]["revision"] == 2
    assert all(row["source_hash"] == "b"*64 and row["status"] == "draft" for row in rows)
    assert client.post(apply_path, headers=owner, json={**body, "revision": preview["revision"]}).status_code == 409
    assert "原标签" in json.loads(db.execute("SELECT tags_json FROM trade_reviews WHERE account_id=?", (ids[2],)).fetchone()[0])
    all_body = {"source": "原标签", "target": "新名称"}
    all_preview = client.post(preview_path, headers=owner, json=all_body).json()
    assert all_preview["affected_reviews"] == 1
    assert client.post(apply_path, headers=other, json={**all_body, "revision": all_preview["revision"]}).status_code == 409
    assert client.post(apply_path, headers=owner, json={**all_body, "revision": all_preview["revision"]}).status_code == 200
    empty = client.post(preview_path, headers=owner, json=all_body).json()
    assert empty["affected_reviews"] == 0
    assert client.post(apply_path, headers=owner, json={**all_body, "revision": empty["revision"]}).status_code == 400


def test_review_screenshots_validate_ownership_limits_and_storage(client, db, monkeypatch):
    import io
    from PIL import Image
    from app.trades import attachments
    owner = web_headers(db, "screenshots@example.com")
    other = web_headers(db, "screenshots-other@example.com")
    created = client.post("/api/v1/accounts", headers=owner, json={"mt5_login": 450001, "broker_server": "Test", "sync_start_time": 0}).json()
    review_id = db.execute("""INSERT INTO trade_reviews(account_id,position_id,anchor_ticket,status,notes,tags_json,source_hash,revision)
        VALUES(?,1,1,'draft','Screenshot note','[]',?,1)""", (created["id"], "a"*64)).lastrowid
    db.commit()
    path = f"/api/v1/my/reviews/{review_id}/attachments"
    def image_bytes(color):
        output = io.BytesIO()
        Image.new("RGB", (8, 8), color).save(output, format="PNG")
        return output.getvalue()
    raw = image_bytes("red")
    assert client.post(path, content=raw).status_code == 401
    assert client.post(path, headers=other, content=raw).status_code == 404
    assert client.get(path, headers=other).status_code == 404
    for invalid in (b"", b"<svg onload='alert(1)'/>", raw[:20]):
        assert client.post(path, headers=owner, content=invalid).status_code == 400
    assert client.post(path, headers=owner, content=b"x"*(attachments.MAX_SIZE+1)).status_code == 413
    uploaded = client.post(path, headers=owner, content=raw)
    assert uploaded.status_code == 201, uploaded.text
    item = uploaded.json()
    assert item["width"] == 8 and item["height"] == 8
    assert client.post(path, headers=owner, content=raw).json()["id"] == item["id"]
    assert len(client.get(path, headers=owner).json()) == 1
    content_path = f"/api/v1/my/review-attachments/{item['id']}"
    assert client.get(content_path, headers=other).status_code == 404
    assert client.delete(content_path, headers=other).status_code == 404
    content = client.get(content_path, headers=owner)
    assert content.headers["content-type"] == "image/png" and content.headers["cache-control"] == "private, no-store"
    assert Image.open(io.BytesIO(content.content)).size == (8, 8)
    scope_path = f"/api/v1/accounts/{created['id']}"
    scope = client.get(scope_path + "/maintenance-preview", headers=owner).json()
    assert scope["counts"]["review_attachments"] == 1
    assert client.delete(content_path, headers=owner).status_code == 200
    assert client.get(content_path, headers=owner).status_code == 404
    assert client.post(scope_path + "/reset-sync", headers=owner, json={"confirm_login": "450001", "revision": scope["revision"], "sync_start_time": 0}).status_code == 409
    for color in range(10):
        assert client.post(path, headers=owner, content=image_bytes((color, 0, 0))).status_code == 201
    assert client.post(path, headers=owner, content=raw).status_code == 409
    scope = client.get(scope_path + "/maintenance-preview", headers=owner).json()
    assert client.post(scope_path + "/reset-sync", headers=owner, json={"confirm_login": "450001", "revision": scope["revision"], "sync_start_time": 0}).status_code == 200
    assert len(client.get(path, headers=owner).json()) == 10
    scope = client.get(scope_path + "/maintenance-preview", headers=owner).json()
    assert client.request("DELETE", scope_path, headers=owner, json={"confirm_login": "450001", "revision": scope["revision"]}).status_code == 200
    assert db.execute("SELECT COUNT(*) FROM review_attachments WHERE review_id=?", (review_id,)).fetchone()[0] == 0
    assert client.get(path, headers=owner).status_code == 404


@pytest.mark.parametrize("format_name", ["PNG", "JPEG", "WEBP"])
def test_screenshot_normalization_supported_formats(format_name, monkeypatch):
    import io
    from PIL import Image
    from app.trades import attachments
    from fastapi import HTTPException
    raw = io.BytesIO()
    Image.new("RGB", (8, 8), "green").save(raw, format=format_name)
    data, width, height = attachments.normalize(raw.getvalue())
    assert (width, height) == (8, 8)
    assert Image.open(io.BytesIO(data)).format == "PNG"
    monkeypatch.setattr(attachments, "MAX_PIXELS", 32)
    with pytest.raises(HTTPException) as failure:
        attachments.normalize(raw.getvalue())
    assert failure.value.status_code == 400


def test_screenshot_rejects_animation_and_strips_metadata():
    import io
    from PIL import Image, PngImagePlugin
    from app.trades.attachments import normalize
    from fastapi import HTTPException
    raw = io.BytesIO()
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("Comment", "private metadata")
    Image.new("RGB", (4, 4), "red").save(raw, format="PNG", pnginfo=metadata)
    data, _, _ = normalize(raw.getvalue() + b"trailing metadata")
    assert not Image.open(io.BytesIO(data)).info
    assert b"trailing metadata" not in data
    animated = io.BytesIO()
    Image.new("RGB", (4, 4), "red").save(animated, format="PNG", save_all=True, append_images=[Image.new("RGB", (4, 4), "blue")], duration=100)
    with pytest.raises(HTTPException) as failure:
        normalize(animated.getvalue())
    assert failure.value.status_code == 400


def test_order_review_status_filters_and_source_changes(client, db):
    login = 460001
    key = make_account(db, login)
    account = db.execute("SELECT * FROM accounts WHERE mt5_login=?", (login,)).fetchone()
    user = db.execute("SELECT * FROM users WHERE id=?", (account["user_id"],)).fetchone()
    headers = {"Authorization": "Bearer " + create_access_token(user, settings)}
    rows = []
    for index in range(3):
        rows.extend([deal(46001 + index * 2, position=46001 + index, entry=0, deal_type=0, open_time=100 + index, deal_time=100 + index),
                     deal(46002 + index * 2, position=46001 + index, entry=1, deal_type=1, open_time=100 + index, deal_time=200 + index)])
    assert signed_post(client, "/api/v1/ingest/deals", key, {"mt5_login": login, "deals": rows}).status_code == 200
    path = "/api/v1/my/orders"
    params = {"account_id": account["id"], "review_status": "unwritten"}
    result = client.get(path, headers=headers, params=params).json()
    assert result["total"] == 3 and all(item["review_status"] == "unwritten" for item in result["items"])
    for item, state in zip(result["items"], ("draft", "reviewed")):
        review_path = f"/api/v1/my/trades/{item['trade_id']}/review"
        old = client.get(review_path, headers=headers).json()
        assert client.put(review_path, headers=headers, json={"revision": old["revision"], "source_hash": old["source_hash"], "status": state, "notes": "", "tags": []}).status_code == 200
        detail = client.get(f"/api/v1/my/trades/{item['trade_id']}", headers=headers).json()
        assert detail["trade"]["review_status"] == state and detail["trade"]["review_source_changed"] is False
    for state in ("unwritten", "draft", "reviewed"):
        filtered = client.get(path, headers=headers, params={**params, "review_status": state, "status": "closed", "page_size": 1}).json()
        assert filtered["total"] == 1 and filtered["items"][0]["review_status"] == state
        assert client.get(path, headers=headers, params={**params, "review_status": state, "page_size": 1, "page": 2}).json()["items"] == []
    other = web_headers(db, "order-review-other@example.com")
    assert client.get(path, headers=other, params=params).status_code == 404
    assert client.get(path, headers=other, params={"review_status": "reviewed"}).json()["total"] == 0
    assert client.get(path, headers=headers, params={**params, "review_status": "invalid"}).status_code == 400
    # Middle trade is reviewed; source corrections should retain status and require rechecking.
    rows[3]["profit"] = 8
    assert signed_post(client, "/api/v1/ingest/deals", key, {"mt5_login": login, "deals": [rows[3]]}).status_code == 200
    changed = client.get(path, headers=headers, params={**params, "review_status": "reviewed"}).json()["items"][0]
    assert changed["review_source_changed"] is True
    review_path = f"/api/v1/my/trades/{changed['trade_id']}/review"
    current = client.get(review_path, headers=headers).json()
    assert client.put(review_path, headers=headers, json={"revision": current["revision"], "source_hash": current["source_hash"], "status": "reviewed", "notes": "", "tags": ["分析标签", "另一个标签"]}).status_code == 200
    performance = "/api/v1/my/performance"
    scope = {"account_id": account["id"], "start_date": "1970-01-01", "end_date": "1970-01-01"}
    assert client.get(performance, headers=headers, params=scope).json()["summary"]["count"] == 3
    for state in ("unwritten", "draft", "reviewed"):
        report = client.get(performance, headers=headers, params={**scope, "review_status": state}).json()
        assert report["summary"]["count"] == 1
    report = client.get(performance, headers=headers, params={**scope, "tag": " 分析标签 ", "review_status": "reviewed"}).json()
    assert report["tag"] == "分析标签" and report["review_status"] == "reviewed"
    assert report["summary"]["count"] == 1
    assert report["summary"]["net_pnl"] == changed["net_pnl"]
    assert sum(day["count"] for day in report["days"]) == sum(item["count"] for item in report["symbols"]) == 1
    for tag in ("分析", "%", "不存在"):
        assert client.get(performance, headers=headers, params={**scope, "tag": tag}).json()["summary"]["count"] == 0
    assert client.get(performance, headers=headers, params={**scope, "tag": "分析标签", "review_status": "unwritten"}).json()["summary"]["count"] == 0
    # Orphan review tags are not earnings without a matching lifecycle.
    db.execute("""INSERT INTO trade_reviews(account_id,position_id,anchor_ticket,status,notes,tags_json,source_hash,revision)
        VALUES(?,999999,999999,'reviewed','','["仅孤立标签"]',?,1)""", (account["id"], "a" * 64))
    db.commit()
    assert client.get(performance, headers=headers, params={**scope, "tag": "仅孤立标签"}).json()["summary"]["count"] == 0
    assert client.get(performance, headers=other, params={**scope, "tag": "分析标签"}).status_code == 404
    assert client.get(performance, headers=headers, params={**scope, "review_status": "bad"}).status_code == 400
    assert client.get(performance, headers=headers, params={**scope, "tag": "x" * 41}).status_code == 400
