"""Smoke-test the TradeSync API v2 contract with a temporary SQLite database.

Run from backend/:
    .\\venv\\Scripts\\python.exe scripts\\v2_smoke_test.py
"""

from __future__ import annotations

import hashlib
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

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings  # noqa: E402
from app.db import init_db  # noqa: E402
from app.security import create_access_token  # noqa: E402

MT5_LOGIN = 88973405
SYNC_KEY = "sk_live_" + secrets.token_urlsafe(32)


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def request(base_url: str, method: str, path: str, token: str | None = None, body: dict | None = None) -> tuple[int, dict]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(base_url + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def wait_for_health(base_url: str) -> None:
    deadline = time.time() + 30
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            status, body = request(base_url, "GET", "/health")
            if status == 200 and body.get("status") == "ok":
                return
        except Exception as exc:  # pragma: no cover - startup timing
            last_error = exc
        time.sleep(0.25)
    raise RuntimeError(f"server did not become ready: {last_error}")


def assert_ok(label: str, condition: bool, body: object) -> None:
    if not condition:
        raise AssertionError(f"{label} failed: {json.dumps(body, ensure_ascii=False)}")
    print(f"OK  {label}")


def seed_database(db_path: Path) -> None:
    init_db(str(db_path))
    with sqlite3.connect(db_path) as db:
        db.execute("INSERT INTO users (id, email) VALUES (?, ?)", (1, "v2-smoke@example.com"))
        db.execute(
            """
            INSERT INTO accounts (id, user_id, mt5_login, key_prefix, key_hash)
            VALUES (?, ?, ?, ?, ?)
            """,
            (1, 1, MT5_LOGIN, SYNC_KEY.split("_", 2)[2][:12], hashlib.sha256(SYNC_KEY.encode()).hexdigest()),
        )
        db.commit()


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="tradesync-v2-smoke-"))
    db_path = temp_dir / "smoke.db"
    log_path = temp_dir / "uvicorn.log"
    seed_database(db_path)

    port = free_port()
    base_url = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    env["TRADESYNC_DB_PATH"] = str(db_path)
    env["TRADESYNC_EMAIL_PROVIDER"] = "console"
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

            status, body = request(api, "POST", "/sync/last_sync_time", SYNC_KEY, {"mt5_login": MT5_LOGIN})
            assert_ok("initial last_sync_time is 0", status == 200 and body.get("last_sync_time") == 0, body)

            deals_payload = {
                "mt5_login": MT5_LOGIN,
                "server_gmt_off": 10800,
                "last_deal_time": 1753082400,
                "deals": [
                    {
                        "deal_ticket": 100001,
                        "order_ticket": 200001,
                        "position_id": 300001,
                        "symbol": "XAUUSD",
                        "deal_type": "BUY",
                        "entry_type": "IN",
                        "deal_time": 1753082300,
                        "price": 2050.1,
                        "volume": 0.1,
                        "commission": -2.5,
                        "swap": 0,
                        "profit": 0,
                        "sl": 2040,
                        "tp": 2060,
                        "comment": "smoke in",
                        "magic": 888888,
                    },
                    {
                        "deal_ticket": 100002,
                        "order_ticket": 200002,
                        "position_id": 300001,
                        "symbol": "XAUUSD",
                        "deal_type": "SELL",
                        "entry_type": "OUT",
                        "deal_time": 1753082400,
                        "price": 2055.2,
                        "volume": 0.1,
                        "commission": -2.5,
                        "swap": 0.1,
                        "profit": 51,
                        "sl": 2040,
                        "tp": 2060,
                        "comment": "smoke out",
                        "magic": 888888,
                    },
                ],
            }
            status, body = request(api, "POST", "/ingest/deals", SYNC_KEY, deals_payload)
            assert_ok("insert two deals", status == 200 and body.get("inserted") == 2 and body.get("duplicates") == 0, body)

            status, body = request(api, "POST", "/ingest/deals", SYNC_KEY, deals_payload)
            assert_ok("repeat upload is idempotent", status == 200 and body.get("inserted") == 0 and body.get("duplicates") == 2, body)

            status, body = request(api, "POST", "/sync/last_sync_time", SYNC_KEY, {"mt5_login": MT5_LOGIN})
            assert_ok("last_sync_time advanced", status == 200 and body.get("last_sync_time") == 1753082400, body)

            symbols_payload = {
                "mt5_login": MT5_LOGIN,
                "symbols": [
                    {
                        "symbol": "XAUUSD",
                        "digits": 2,
                        "point": 0.01,
                        "contract_size": 100,
                        "tick_value": 1,
                        "tick_size": 0.01,
                        "currency_base": "XAU",
                        "currency_profit": "USD",
                    }
                ],
            }
            status, body = request(api, "POST", "/ingest/symbols", SYNC_KEY, symbols_payload)
            assert_ok("symbol upsert", status == 200 and body.get("upserted") == 1, body)

            snapshot_payload = {
                "mt5_login": MT5_LOGIN,
                "timestamp": 1753082401,
                "balance": 10000,
                "equity": 10051.2,
                "margin": 0,
                "free_margin": 10051.2,
                "margin_level": 0,
            }
            status, body = request(api, "POST", "/ingest/snapshot", SYNC_KEY, snapshot_payload)
            assert_ok("snapshot accepted", status == 200 and body.get("accepted") is True, body)

            heartbeat_payload = {"mt5_login": MT5_LOGIN, "timestamp": 1753082402, "version": "2.00"}
            status, body = request(api, "POST", "/sync/heartbeat", SYNC_KEY, heartbeat_payload)
            assert_ok("heartbeat received", status == 200 and body.get("received") is True, body)

            status, body = request(api, "POST", "/sync/last_sync_time", None, {"mt5_login": MT5_LOGIN})
            assert_ok("missing token returns standard error", status == 401 and body.get("error", {}).get("code") == "MISSING_SECRET_KEY", body)

            bad_payload = dict(deals_payload)
            bad_payload["last_deal_time"] = 1753082399
            status, body = request(api, "POST", "/ingest/deals", SYNC_KEY, bad_payload)
            assert_ok("bad last_deal_time returns standard error", status == 400 and body.get("error", {}).get("code") == "INVALID_LAST_DEAL_TIME", body)

            user_token = create_access_token({"id": 1, "email": "v2-smoke@example.com"}, get_settings())
            status, body = request(api, "GET", "/accounts", user_token)
            account = body[0] if isinstance(body, list) and body else {}
            assert_ok(
                "account stats include symbols and snapshots",
                status == 200
                and account.get("deal_count") == 2
                and account.get("symbol_count") == 1
                and account.get("snapshot_count") == 1
                and abs(float(account.get("latest_equity") or 0) - 10051.2) < 0.000001,
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

