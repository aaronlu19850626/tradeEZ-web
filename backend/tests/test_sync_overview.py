from __future__ import annotations

import hashlib
import time

from test_sync_handshake import (  # noqa: F401
    client, db, signed_post, deal, create_access_token, settings,
)
from app.crypto import encrypt_sync_key


def make_isolated_account(db_connection, email, login, status="active"):
    db_connection.execute("INSERT INTO users(email) VALUES(?)", (email,))
    db_connection.commit()
    user_id = db_connection.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()[0]
    token = f"sk_live_{login}_abcdefghijklmnopqrstuvwxyz0123456789ABCD"
    db_connection.execute(
        """
        INSERT INTO accounts (
            user_id, mt5_login, label, broker_server, account_currency,
            status, key_prefix, key_hash, key_encrypted, key_environment
        ) VALUES (?, ?, ?, 'Test-Server', 'USD', ?, ?, ?, ?, 'live')
        """,
        (user_id, login, f"Account {login}", status,
         token.split("_", 2)[2][:12],
         hashlib.sha256(token.encode()).hexdigest(),
         encrypt_sync_key(token, settings)),
    )
    db_connection.commit()
    return token, {"Authorization": "Bearer " + create_access_token(
        db_connection.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone(), settings)}


def _id(db_connection, login):
    return db_connection.execute("SELECT id FROM accounts WHERE mt5_login=?", (login,)).fetchone()[0]


def test_overview_requires_auth_and_empty_for_new_user(client, db):
    assert client.get("/api/v1/my/sync-overview").status_code == 401
    db.execute("INSERT INTO users(email) VALUES(?)", ("overview-fresh@example.com",))
    db.commit()
    fresh_user = db.execute("SELECT * FROM users WHERE email=?", ("overview-fresh@example.com",)).fetchone()
    fresh = {"Authorization": "Bearer " + create_access_token(fresh_user, settings)}
    body = client.get("/api/v1/my/sync-overview", headers=fresh).json()
    assert body["accounts"]["total"] == 0
    assert body["trades"]["needs_review"] == 0
    assert body["cursor_uncommitted"] == [] and body["heartbeat_stale"] == []
    assert client.get("/api/v1/my/sync-overview", headers=fresh, params={"heartbeat_stale_after": 10}).status_code == 400


def test_overview_flags_uncommitted_cursor_and_clear_after_commit(client, db):
    key, headers = make_isolated_account(db, "overview-a@example.com", 480001)
    rows = [
        deal(48001, position=48001, entry=0, deal_type=0, open_time=100, deal_time=100),
        deal(48002, position=48001, entry=1, deal_type=1, open_time=100, deal_time=200),
    ]
    assert signed_post(client, "/api/v1/ingest/deals", key, {"mt5_login": 480001, "deals": rows}).status_code == 200
    body = client.get("/api/v1/my/sync-overview", headers=headers, params={"heartbeat_stale_after": 60}).json()
    assert body["accounts"]["total"] == 1 and body["accounts"]["active"] == 1
    assert body["trades"]["complete"] == 1
    uncommitted = {int(item["mt5_login"]): item for item in body["cursor_uncommitted"]}
    assert uncommitted[480001]["latest_close_time"] == 200
    assert any(int(item["mt5_login"]) == 480001 for item in body["heartbeat_stale"])

    assert signed_post(client, "/api/v1/sync/update_last_sync_time", key,
                       {"mt5_login": 480001, "last_sync_time": 200}).status_code == 200
    body = client.get("/api/v1/my/sync-overview", headers=headers).json()
    assert body["cursor_uncommitted"] == []


def test_overview_tracks_needs_review_heartbeat_recovery_and_resync(client, db):
    key, headers = make_isolated_account(db, "overview-b@example.com", 480002)
    account_id = _id(db, 480002)
    close_only = deal(48003, position=48003, entry=1, deal_type=1, open_time=100, deal_time=300)
    assert signed_post(client, "/api/v1/ingest/deals", key, {"mt5_login": 480002, "deals": [close_only]}).status_code == 200
    body = client.get("/api/v1/my/sync-overview", headers=headers, params={"heartbeat_stale_after": 60}).json()
    assert body["trades"]["needs_review"] == 1
    assert body["trades"]["reconciliation_untracked"] == 1
    assert any(int(item["mt5_login"]) == 480002 for item in body["heartbeat_stale"])

    assert signed_post(client, "/api/v1/ingest/heartbeat", key, {"mt5_login": 480002}).status_code == 200
    body = client.get("/api/v1/my/sync-overview", headers=headers).json()
    assert all(int(item["mt5_login"]) != 480002 for item in body["heartbeat_stale"])

    db.execute("UPDATE accounts SET resync_pending=1 WHERE id=?", (account_id,))
    db.commit()
    body = client.get("/api/v1/my/sync-overview", headers=headers).json()
    assert body["accounts"]["resync_pending"] == 1
    assert int(body["resync_pending_accounts"][0]["mt5_login"]) == 480002


def test_overview_reports_signature_failure_signal(client, db):
    key, headers = make_isolated_account(db, "overview-c@example.com", 480003)
    raw = b'{"mt5_login":480003}'
    rejected = client.post("/api/v1/ingest/heartbeat", content=raw, headers={
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "X-Timestamp": str(int(time.time())),
        "X-Signature": "0" * 64,
    })
    assert rejected.status_code == 401
    overview = client.get("/api/v1/my/sync-overview", headers=headers).json()
    flagged = {int(item["mt5_login"]): item for item in overview["auth_errors"]}
    assert 480003 in flagged
    assert flagged[480003]["sync_auth_error_code"] in {"SIGNATURE_MISMATCH", "INVALID_SECRET_KEY"}


def test_overview_is_scoped_per_user(client, db):
    make_isolated_account(db, "overview-owned@example.com", 480004)
    db.execute("INSERT INTO users(email) VALUES(?)", ("overview-other@example.com",))
    db.commit()
    other_user = db.execute("SELECT * FROM users WHERE email=?", ("overview-other@example.com",)).fetchone()
    other = {"Authorization": "Bearer " + create_access_token(other_user, settings)}
    body = client.get("/api/v1/my/sync-overview", headers=other).json()
    assert body["accounts"]["total"] == 0
