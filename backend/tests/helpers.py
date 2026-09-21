from __future__ import annotations

import hashlib
import hmac
import json
import os
import time

os.environ.setdefault("TRADESYNC_SYNC_KEY_ENCRYPTION_SECRET", "unit-test-encryption-secret")
os.environ.setdefault("TRADESYNC_AUTH_SECRET", "unit-test-auth-secret")
os.environ.setdefault("TRADESYNC_EMAIL_PROVIDER", "console")
os.environ.setdefault("TRADESYNC_DEV_FIXED_LOGIN_CODE", "")
os.environ.setdefault("TRADESYNC_AUTH_TEST_MODE", "false")
os.environ.setdefault("TRADESYNC_ENVIRONMENT", "test")

from app.config import get_settings  # noqa: E402
from app.crypto import encrypt_sync_key  # noqa: E402
from app.security import create_access_token  # noqa: E402

settings = get_settings()


def web_headers(db, email: str) -> dict[str, str]:
    db.execute("INSERT INTO users (email) VALUES (?)", (email,))
    db.commit()
    user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    return {"Authorization": "Bearer " + create_access_token(user, settings)}


def make_account(db, login: int, status: str = "active") -> str:
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


def signed_post(client, path: str, token: str, payload: dict):
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


def deal(
    ticket: int,
    *,
    position: int,
    entry: int,
    deal_type: int,
    open_time: int,
    deal_time: int,
    volume: float = 0.01,
) -> dict:
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
