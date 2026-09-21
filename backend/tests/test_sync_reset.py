"""Date-based reset must not let a sync cycle that started before it win.

The EA trusts the cursor it reads from the server, so a client that was already
collecting when the user resets the account still carries the previous window.
These tests pin the guards that stop it from storing out-of-window deals or
advancing the cursor over the reset.
"""
from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.account_center.schemas import date_to_epoch
from helpers import signed_post, web_headers

PLATFORM_TZ = ZoneInfo("Asia/Shanghai")


def bj_epoch(day: str, hour: int = 0) -> int:
    return int(datetime.fromisoformat(f"{day}T{hour:02d}:00:00").replace(tzinfo=PLATFORM_TZ).timestamp())


def create_account(client, headers, login: int, start: str) -> dict:
    response = client.post(
        "/api/v1/accounts",
        headers=headers,
        json={"name": f"MT5 {login}", "platform": "mt5", "currency": "USD", "mt5_login": login, "sync_start_date": start},
    )
    assert response.status_code == 201, response.text
    return response.json()


def reset_account(client, headers, account: dict, start: str) -> None:
    response = client.post(
        f"/api/v1/accounts/{account['id']}/reset-sync",
        headers=headers,
        json={"name": account["name"], "sync_start_date": start},
    )
    assert response.status_code == 200, response.text


def closed_position(ticket: int, position: int, open_time: int, close_time: int) -> list[dict]:
    def row(deal_ticket: int, entry: int, moment: int) -> dict:
        return {
            "ticket": deal_ticket,
            "position_id": position,
            "order_id": deal_ticket + 100000,
            "symbol": "XAUUSD",
            "entry": entry,
            "type": 0,
            "volume": 0.1,
            "price": 2000.0,
            "sl_price": 1990.0,
            "tp_price": 2020.0,
            "profit": 10.0 if entry == 1 else 0.0,
            "swap": 0.0,
            "commission": 0.0,
            "magic": 1,
            "comment": "",
            "open_time": open_time,
            "deal_time": moment,
        }

    return [row(ticket, 0, open_time), row(ticket + 1, 1, close_time)]


def test_deals_before_sync_window_are_rejected(client, db):
    headers = web_headers(db, "reset-window@example.com")
    login = 921301
    account = create_account(client, headers, login, "2026-06-01")
    key = account["sync_key"]

    stale = bj_epoch("2026-01-15", 12)
    rejected = signed_post(
        client,
        "/api/v1/ingest/deals",
        key,
        {"mt5_login": login, "deals": closed_position(700001, 700001, stale - 3600, stale)},
    )
    assert rejected.status_code == 409, rejected.text
    assert rejected.json()["error"]["code"] == "DEAL_BEFORE_SYNC_START"
    assert db.execute("SELECT COUNT(*) FROM deals WHERE account_login=%s", (login,)).fetchone()[0] == 0

    # The documented 30-day lookback stays inside the window.
    in_lookback = bj_epoch("2026-05-15", 12)
    allowed = signed_post(
        client,
        "/api/v1/ingest/deals",
        key,
        {"mt5_login": login, "deals": closed_position(700002, 700002, in_lookback - 3600, in_lookback)},
    )
    assert allowed.status_code == 200, allowed.text

    in_window = bj_epoch("2026-07-01", 12)
    accepted = signed_post(
        client,
        "/api/v1/ingest/deals",
        key,
        {"mt5_login": login, "deals": closed_position(700003, 700003, in_window - 3600, in_window)},
    )
    assert accepted.status_code == 200, accepted.text


def test_reset_blocks_stale_cursor_confirmation(client, db):
    headers = web_headers(db, "reset-cursor@example.com")
    login = 921302
    account = create_account(client, headers, login, "2026-01-01")
    key = account["sync_key"]

    handshake = signed_post(client, "/api/v1/sync/last_sync_time", key, {"mt5_login": login})
    assert handshake.status_code == 200, handshake.text
    assert handshake.json()["last_sync_time"] == date_to_epoch(date(2026, 1, 1))

    t1 = bj_epoch("2026-08-01", 12)
    assert signed_post(
        client, "/api/v1/ingest/deals", key, {"mt5_login": login, "deals": closed_position(701001, 701001, t1 - 3600, t1)}
    ).status_code == 200
    confirmed = signed_post(client, "/api/v1/sync/update_last_sync_time", key, {"mt5_login": login, "last_sync_time": t1})
    assert confirmed.status_code == 200 and confirmed.json()["updated"] is True
    assert db.execute("SELECT last_sync_time FROM accounts WHERE id=%s", (account["id"],)).fetchone()[0] == t1

    # The user resets the sync window while a client still holds the old cursor.
    reset_account(client, headers, account, "2026-05-01")
    row = db.execute("SELECT last_sync_time, resync_pending FROM accounts WHERE id=%s", (account["id"],)).fetchone()
    assert (int(row["last_sync_time"]), int(row["resync_pending"])) == (0, 1)

    # Confirming the stale cursor must not push the cursor back over the reset.
    stale = signed_post(client, "/api/v1/sync/update_last_sync_time", key, {"mt5_login": login, "last_sync_time": t1})
    assert stale.status_code == 409, stale.text
    assert stale.json()["error"]["code"] == "RESYNC_REQUIRED"
    assert db.execute("SELECT last_sync_time FROM accounts WHERE id=%s", (account["id"],)).fetchone()[0] == 0

    # A fresh handshake acknowledges the reset and restarts from the new bound.
    rehandshake = signed_post(client, "/api/v1/sync/last_sync_time", key, {"mt5_login": login})
    assert rehandshake.status_code == 200, rehandshake.text
    assert rehandshake.json()["last_sync_time"] == date_to_epoch(date(2026, 5, 1))
    assert db.execute("SELECT resync_pending FROM accounts WHERE id=%s", (account["id"],)).fetchone()[0] == 0

    t2 = bj_epoch("2026-08-15", 12)
    assert signed_post(
        client, "/api/v1/ingest/deals", key, {"mt5_login": login, "deals": closed_position(701002, 701002, t2 - 3600, t2)}
    ).status_code == 200
    recovered = signed_post(client, "/api/v1/sync/update_last_sync_time", key, {"mt5_login": login, "last_sync_time": t2})
    assert recovered.status_code == 200 and recovered.json()["updated"] is True


def test_reset_invalidates_in_flight_batch_run(client, db):
    headers = web_headers(db, "reset-run@example.com")
    login = 921303
    account = create_account(client, headers, login, "2026-01-01")
    key = account["sync_key"]

    handshake = signed_post(client, "/api/v1/sync/last_sync_time", key, {"mt5_login": login})
    run_id = handshake.json()["sync_run_id"]
    reset_account(client, headers, account, "2026-05-01")

    close = bj_epoch("2026-07-01", 12)
    response = signed_post(
        client,
        "/api/v1/ingest/deals",
        key,
        {
            "mt5_login": login,
            "deals": closed_position(702001, 702001, close - 3600, close),
            "sync_run_id": run_id,
            "batch_id": "resetrun0001",
            "batch_index": 0,
            "batch_count": 1,
        },
    )
    assert response.status_code == 404, response.text
    assert response.json()["error"]["code"] == "SYNC_RUN_NOT_FOUND"
