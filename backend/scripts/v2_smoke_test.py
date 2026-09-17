"""Smoke-test the TradeSync API v2.1 contract with a temporary SQLite database.

Run from backend/:
    .\\venv\\Scripts\\python.exe scripts\\v2_smoke_test.py
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

os.environ.setdefault("TRADESYNC_AUTH_SECRET", "v2-smoke-auth-secret")
os.environ.setdefault("TRADESYNC_SYNC_KEY_ENCRYPTION_SECRET", "v2-smoke-key-encryption-secret")
os.environ.setdefault("TRADESYNC_EMAIL_PROVIDER", "console")

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings  # noqa: E402
from app.crypto import encrypt_sync_key  # noqa: E402
from app.db import init_db  # noqa: E402
from app.security import create_access_token  # noqa: E402

MT5_LOGIN = 88973405
OTHER_LOGIN = 88973406
SYNC_KEY = "sk_live_" + secrets.token_urlsafe(32)
OTHER_SYNC_KEY = "sk_live_" + ("o" * 40)
SETTINGS = get_settings()


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def raw_request(base_url: str, method: str, path: str, body: bytes | None = None, headers: dict | None = None) -> tuple[int, dict]:
    request_headers = {"Content-Type": "application/json"}
    if headers:
        request_headers.update(headers)
    req = urllib.request.Request(base_url + path, data=body, method=method, headers=request_headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def signed_request(
    base_url: str,
    path: str,
    body_obj: dict,
    *,
    token: str = SYNC_KEY,
    timestamp: int | None = None,
    raw_body: bytes | None = None,
    signature: str | None = None,
    include_auth: bool = True,
    include_timestamp: bool = True,
    include_signature: bool = True,
) -> tuple[int, dict]:
    if raw_body is None:
        raw_body = json.dumps(body_obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    ts = int(time.time()) if timestamp is None else timestamp
    if signature is None:
        signature = hmac.new(token.encode("utf-8"), raw_body + str(ts).encode("ascii"), hashlib.sha256).hexdigest()

    headers = {}
    if include_auth:
        headers["Authorization"] = f"Bearer {token}"
    if include_timestamp:
        headers["X-Timestamp"] = str(ts)
    if include_signature:
        headers["X-Signature"] = signature
    return raw_request(base_url, "POST", path, raw_body, headers)


def wait_for_health(base_url: str) -> None:
    deadline = time.time() + 30
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            status, body = raw_request(base_url, "GET", "/health")
            if status == 200 and body.get("status") == "ok":
                return
        except Exception as exc:  # pragma: no cover - startup timing
            last_error = exc
        time.sleep(0.25)
    raise RuntimeError(f"server did not become ready: {last_error}")


def assert_ok(label: str, condition: bool, body: object) -> None:
    if not condition:
        raise AssertionError(f"{label} failed: {json.dumps(body, ensure_ascii=False, default=str)}")
    print(f"OK  {label}")


def seed_database(db_path: Path) -> None:
    init_db(str(db_path))
    with sqlite3.connect(db_path) as db:
        db.execute("INSERT INTO users (id, email) VALUES (?, ?)", (1, "v2-smoke@example.com"))
        db.execute(
            """
            INSERT INTO accounts (
                id, user_id, mt5_login, key_prefix, key_hash, key_encrypted, key_environment
            ) VALUES (?, ?, ?, ?, ?, ?, 'live')
            """,
            (
                1,
                1,
                MT5_LOGIN,
                SYNC_KEY.split("_", 2)[2][:12],
                hashlib.sha256(SYNC_KEY.encode("utf-8")).hexdigest(),
                encrypt_sync_key(SYNC_KEY, SETTINGS),
            ),
        )
        db.execute(
            """
            INSERT INTO accounts (
                id, user_id, mt5_login, key_prefix, key_hash, key_encrypted, key_environment
            ) VALUES (?, ?, ?, ?, ?, ?, 'live')
            """,
            (
                2,
                1,
                OTHER_LOGIN,
                OTHER_SYNC_KEY.split("_", 2)[2][:12],
                hashlib.sha256(OTHER_SYNC_KEY.encode("utf-8")).hexdigest(),
                encrypt_sync_key(OTHER_SYNC_KEY, SETTINGS),
            ),
        )
        db.commit()


def deal(ticket: int, open_time: int, deal_time: int | None = None, **overrides) -> dict:
    payload = {
        "ticket": ticket,
        "position_id": ticket,
        "order_id": ticket + 5_000_000,
        "symbol": "XAUUSD",
        "entry": 0,
        "type": 0,
        "volume": 0.10,
        "price": 2050.50,
        "sl_price": 2040.00,
        "tp_price": 2060.00,
        "profit": 0.0,
        "swap": 0.0,
        "commission": -2.50,
        "magic": 920717,
        "comment": "TradeEZ-SC",
        "open_time": open_time,
        "deal_time": deal_time if deal_time is not None else open_time,
    }
    payload.update(overrides)
    return payload


def deals_payload(deals: list[dict]) -> dict:
    return {"mt5_login": MT5_LOGIN, "server_gmt_off": 0, "deals": deals}


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="tradesync-v21-smoke-"))
    db_path = temp_dir / "smoke.db"
    log_path = temp_dir / "uvicorn.log"
    seed_database(db_path)

    port = free_port()
    base_url = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    env["TRADESYNC_DB_PATH"] = str(db_path)
    env["PYTHONPYCACHEPREFIX"] = str(temp_dir / "pycache")

    with log_path.open("w", encoding="utf-8") as log:
        server = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)],
            cwd=BACKEND_ROOT,
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        try:
            wait_for_health(base_url)
            api = base_url + "/api/v1"
            now = int(time.time())
            base_open = now - 3600
            account_body = {"mt5_login": MT5_LOGIN}

            status, body = raw_request(api, "POST", "/sync/last_sync_time", b'{"mt5_login":%d}' % MT5_LOGIN, {"Authorization": f"Bearer {SYNC_KEY}"})
            assert_ok("encrypted key requires HMAC headers", status == 401 and body["error"]["code"] == "TIMESTAMP_EXPIRED", body)

            status, body = signed_request(api, "/sync/last_sync_time", account_body, signature="0" * 64)
            assert_ok("wrong signature is rejected", status == 401 and body["error"]["code"] == "SIGNATURE_MISMATCH", body)

            status, body = signed_request(api, "/sync/last_sync_time", account_body, timestamp=now - 600)
            assert_ok("expired timestamp is rejected", status == 401 and body["error"]["code"] == "TIMESTAMP_EXPIRED", body)

            good_raw = b'{"mt5_login":%d}' % MT5_LOGIN
            tampered_raw = b'{"mt5_login": %d}' % MT5_LOGIN
            tampered_ts = int(time.time())
            tampered_signature = hmac.new(
                SYNC_KEY.encode("utf-8"), good_raw + str(tampered_ts).encode("ascii"), hashlib.sha256
            ).hexdigest()
            status, body = signed_request(
                api,
                "/sync/last_sync_time",
                account_body,
                raw_body=tampered_raw,
                timestamp=tampered_ts,
                signature=tampered_signature,
            )
            assert_ok("tampered body is rejected", status == 401 and body["error"]["code"] == "SIGNATURE_MISMATCH", body)

            status, body = signed_request(api, "/sync/last_sync_time", {"mt5_login": OTHER_LOGIN})
            assert_ok("key/account mismatch returns 403", status == 403 and body["error"]["code"] == "ACCOUNT_KEY_MISMATCH", body)

            status, body = signed_request(api, "/sync/last_sync_time", account_body, raw_body=good_raw)
            assert_ok("HMAC request succeeds and initial cursor is 0", status == 200 and body.get("last_sync_time") == 0, body)

            first_deal = deal(1001, base_open)
            status, body = signed_request(api, "/ingest/deals", deals_payload([first_deal]))
            assert_ok("first deal is inserted", status == 200 and body == {"accepted": 1, "inserted": 1, "duplicates": 0}, body)

            status, body = signed_request(api, "/sync/last_sync_time", account_body)
            assert_ok("deal upload does not advance cursor", status == 200 and body.get("last_sync_time") == 0, body)

            status, body = signed_request(api, "/ingest/deals", deals_payload([first_deal]))
            assert_ok("duplicate ticket is accepted and counted", status == 200 and body == {"accepted": 1, "inserted": 0, "duplicates": 1}, body)

            same_second_deals = [first_deal, deal(1002, base_open, comment="TradeEZ-TR")]
            status, body = signed_request(api, "/ingest/deals", deals_payload(same_second_deals))
            assert_ok("two tickets with the same open_time can coexist", status == 200 and body == {"accepted": 2, "inserted": 1, "duplicates": 1}, body)

            status, body = signed_request(api, "/ingest/deals", deals_payload(same_second_deals))
            assert_ok("inclusive same-second boundary safely retransmits", status == 200 and body == {"accepted": 2, "inserted": 0, "duplicates": 2}, body)

            status, body = signed_request(
                api,
                "/sync/update_last_sync_time",
                {"mt5_login": MT5_LOGIN, "last_sync_time": base_open + 999},
            )
            assert_ok("cursor ahead of received data returns 409", status == 409 and body["error"]["code"] == "CURSOR_AHEAD_OF_DATA", body)

            status, body = signed_request(
                api,
                "/sync/update_last_sync_time",
                {"mt5_login": MT5_LOGIN, "last_sync_time": base_open},
            )
            assert_ok("received open_time advances cursor", status == 200 and body == {"last_sync_time": base_open, "updated": True}, body)

            status, body = signed_request(
                api,
                "/sync/update_last_sync_time",
                {"mt5_login": MT5_LOGIN, "last_sync_time": base_open - 10},
            )
            assert_ok("smaller cursor does not move backwards", status == 200 and body == {"last_sync_time": base_open, "updated": False}, body)

            invalid_batch = deals_payload([deal(9001, base_open), {**deal(9002, base_open), "ticket": 0}])
            status, body = signed_request(api, "/ingest/deals", invalid_batch)
            assert_ok("an invalid record rejects the whole request", status == 400 and str(body["error"]["code"]).startswith("INVALID"), body)

            oversized = [deal(300000 + i, base_open - 2000 + (i % 1000)) for i in range(1001)]
            status, body = signed_request(api, "/ingest/deals", deals_payload(oversized))
            assert_ok("1001 deals are rejected", status == 400 and str(body["error"]["code"]).startswith("INVALID"), body)

            thousand_deals = [deal(400000 + i, base_open - 2000 + (i % 1000)) for i in range(1000)]
            status, body = signed_request(api, "/ingest/deals", deals_payload(thousand_deals))
            assert_ok("1000 deals can be processed", status == 200 and body == {"accepted": 1000, "inserted": 1000, "duplicates": 0}, body)

            status, body = signed_request(api, "/sync/last_sync_time", account_body)
            assert_ok("batch upload still does not implicitly move cursor", status == 200 and body.get("last_sync_time") == base_open, body)

            snapshot_time = now - 5
            close_deal = deal(
                1003,
                base_open,
                base_open + 123,
                position_id=1001,
                order_id=10_001_003,
                entry=1,
                type=1,
                profit=5.0,
                swap=-1.0,
                commission=-2.0,
                tp_price=2060.0,
            )
            status, body = signed_request(api, "/ingest/deals", deals_payload([close_deal]))
            assert_ok("closing deal for position detail tests is inserted", status == 200 and body.get("inserted") == 1, body)

            close_only_deal = deal(
                1004,
                base_open,
                base_open + 50,
                position_id=999999,
                order_id=10_001_004,
                entry=1,
                type=1,
                profit=1.0,
            )
            status, body = signed_request(api, "/ingest/deals", deals_payload([close_only_deal]))
            assert_ok("close-only deal is stored without becoming a valid order", status == 200 and body.get("inserted") == 1, body)

            symbols_body = {
                "mt5_login": MT5_LOGIN,
                "symbols": [{"name": "GOLD#", "digits": 2, "point": 0.01, "tick_value": 1.0, "contract_size": 100.0}],
            }
            status, body = signed_request(api, "/ingest/symbols", symbols_body)
            assert_ok("v2.1 symbols endpoint accepts spec", status == 200 and body == {"accepted": 1}, body)

            snapshots_body = {
                "mt5_login": MT5_LOGIN,
                "snapshots": [{
                    "balance": 10000.0,
                    "equity": 10125.30,
                    "margin": 300.0,
                    "free_margin": 9825.30,
                    "snapshot_time": snapshot_time,
                }],
            }
            status, body = signed_request(api, "/ingest/snapshots", snapshots_body)
            assert_ok("v2.1 snapshots array endpoint accepts snapshot", status == 200 and body == {"accepted": 1}, body)

            heartbeat_body = {
                "mt5_login": MT5_LOGIN,
                "server_gmt_offset": 10800,
                "server_timezone_name": "UTC+3",
            }
            status, body = signed_request(api, "/ingest/heartbeat", heartbeat_body)
            assert_ok(
                "v2.1 heartbeat endpoint responds with server time",
                status == 200 and body.get("ok") is True and abs(int(body.get("server_time", 0)) - now) <= 5,
                body,
            )

            status, body = signed_request(
                api,
                "/ingest/heartbeat",
                {"mt5_login": OTHER_LOGIN},
                token=OTHER_SYNC_KEY,
            )
            assert_ok("legacy heartbeat without timezone fields stays unknown", status == 200, body)

            with sqlite3.connect(db_path) as db:
                row = db.execute(
                    "SELECT open_time, deal_time FROM deals WHERE account_login=? AND ticket=1001",
                    (MT5_LOGIN,),
                ).fetchone()
                snap = db.execute(
                    "SELECT timestamp, equity FROM snapshots WHERE account_login=? AND timestamp=?",
                    (MT5_LOGIN, snapshot_time),
                ).fetchone()
                legacy_account_tz = db.execute(
                    "SELECT server_gmt_off, server_timezone_name FROM accounts WHERE mt5_login=?",
                    (OTHER_LOGIN,),
                ).fetchone()
                legacy_heartbeat_tz = db.execute(
                    "SELECT server_gmt_offset, server_timezone_name FROM heartbeats WHERE account_login=?",
                    (OTHER_LOGIN,),
                ).fetchone()
            assert_ok("deal UTC timestamps are stored unchanged", row == (base_open, base_open), row)
            assert_ok("snapshot UTC timestamp is stored unchanged", snap == (snapshot_time, 10125.30), snap)
            assert_ok(
                "legacy heartbeat timezone remains unknown",
                legacy_account_tz == (None, None) and legacy_heartbeat_tz == (None, None),
                (legacy_account_tz, legacy_heartbeat_tz),
            )

            user_token = create_access_token({"id": 1, "email": "v2-smoke@example.com"}, SETTINGS)
            status, body = raw_request(
                api,
                "GET",
                "/accounts",
                headers={"Authorization": f"Bearer {user_token}"},
            )
            account = next(item for item in body if item.get("mt5_login") == MT5_LOGIN)
            assert_ok(
                "dashboard account stats reflect v2.1 data without temporary handshake fields",
                status == 200
                and account["deal_count"] == 1004
                and account["synced_order_count"] == 1002
                and account["server_gmt_off"] == 10800
                and account["server_timezone_name"] == "UTC+3"
                and account["symbol_count"] == 1
                and account["snapshot_count"] == 1
                and "last_deal_handshake_at" not in account,
                body,
            )

            status, body = raw_request(
                api,
                "GET",
                "/my/api-logs?limit=200",
                headers={"Authorization": f"Bearer {user_token}"},
            )
            # The log-query API itself is audited, so fetch once more to observe that row.
            status, body = raw_request(
                api,
                "GET",
                "/my/api-logs?limit=200",
                headers={"Authorization": f"Bearer {user_token}"},
            )
            actions = {item.get("action") for item in body} if isinstance(body, list) else set()
            serialized_logs = json.dumps(body, ensure_ascii=False, default=str)
            deal_logs = [item for item in body] if isinstance(body, list) else []
            assert_ok(
                "audit logs are visible in console and contain counts without order details",
                status == 200
                and {"ingest_deals", "update_cursor", "heartbeat", "ingest_symbols", "ingest_snapshots", "query_api_logs"} <= actions
                and any(item.get("item_count") == 1 for item in deal_logs if item.get("action") == "ingest_deals")
                and "XAUUSD" not in serialized_logs
                and "TradeEZ-SC" not in serialized_logs,
                body,
            )

            status, body = raw_request(
                api,
                "GET",
                "/my/accounts/1/positions",
                headers={"Authorization": f"Bearer {user_token}"},
            )
            close_only_order = next((item for item in body if item.get("position_id") == 999999), None) if isinstance(body, list) else None
            closed_order = next((item for item in body if item.get("position_id") == 1001), None) if isinstance(body, list) else None
            assert_ok(
                "order list includes ticket, stop levels, swap, commission and second-level duration",
                status == 200
                and closed_order is not None
                and close_only_order is None
                and closed_order.get("tp_price") == 2060.0
                and closed_order.get("swap_total") == -1.0
                and closed_order.get("commission_total") == -4.5
                and closed_order.get("hold_seconds") == 123,
                body,
            )

            print("SMOKE_TEST_OK")
            print(f"Temporary database: {db_path}")
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)


if __name__ == "__main__":
    main()
