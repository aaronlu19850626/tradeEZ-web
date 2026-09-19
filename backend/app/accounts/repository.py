"""SQL persistence only; transaction boundaries belong to service functions."""
from __future__ import annotations

from app.db import DBCursor, DBConnection

from collections.abc import Sequence


def find_key_prefix(db: DBConnection, params: Sequence[object]) -> DBCursor:
    return db.execute("SELECT 1 FROM accounts WHERE key_prefix = ?", params)


def deal_statistics(db: DBConnection, params: Sequence[object]) -> DBCursor:
    return db.execute("""
        SELECT
            COUNT(*) AS deal_count,
            COUNT(DISTINCT CASE
                WHEN position_id > 0
                 AND open_time > 0
                 AND TRIM(COALESCE(symbol, '')) <> ''
                 AND volume > 0
                 AND price > 0
                 AND entry IN (0, 2)
                THEN position_id
            END) AS synced_order_count,
            MAX(deal_time) AS latest_deal_time,
            MAX(CASE WHEN entry IN (1,2,3) AND type IN (0,1) THEN deal_time END) AS latest_close_time
        FROM deals
        WHERE account_login = ?
        """, params)


def symbol_statistics(db: DBConnection, params: Sequence[object]) -> DBCursor:
    return db.execute("SELECT COUNT(*) AS symbol_count FROM symbols WHERE account_login = ?", params)


def snapshot_statistics(db: DBConnection, params: Sequence[object]) -> DBCursor:
    return db.execute("""
        SELECT COUNT(*) AS snapshot_count,
               MAX(timestamp) AS latest_snapshot_time,
               (SELECT equity FROM snapshots WHERE account_login = ? ORDER BY timestamp DESC LIMIT 1) AS latest_equity
        FROM snapshots
        WHERE account_login = ?
        """, params)


def settings_statistics(db: DBConnection, params: Sequence[object]) -> DBCursor:
    return db.execute("""
        SELECT COUNT(*) AS settings_count,
               MAX(snapshot_time) AS latest_settings_time
          FROM ea_settings_history
         WHERE account_login = ?
        """, params)


def find_owned_account(db: DBConnection, params: Sequence[object]) -> DBCursor:
    return db.execute("SELECT * FROM accounts WHERE id = ? AND user_id = ?", params)


def find_login(db: DBConnection, params: Sequence[object]) -> DBCursor:
    return db.execute("SELECT id, user_id FROM accounts WHERE mt5_login = ?", params)


def insert_account(db: DBConnection, params: Sequence[object]) -> DBCursor:
    return db.execute("""
        INSERT INTO accounts (
            user_id, mt5_login, label, broker_server, account_currency,
            server_gmt_off, server_timezone_name, sync_start_time,
            key_prefix, key_hash, key_encrypted,
            key_environment, notes, key_created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        """, params)


def find_by_id(db: DBConnection, params: Sequence[object]) -> DBCursor:
    return db.execute("SELECT * FROM accounts WHERE id = ?", params)


def list_owned_accounts(db: DBConnection, params: Sequence[object]) -> DBCursor:
    return db.execute("SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC, id DESC", params)


def update_fields(db: DBConnection, account_id: int, user_id: int, values: dict[str, object]) -> None:
    allowed = {"label", "notes", "broker_server", "account_currency", "status", "sync_start_time", "server_timezone_name"}
    if not values or not values.keys() <= allowed:
        raise ValueError("Account update fields must use the repository whitelist")
    fields = [f"{column} = ?" for column in values]
    fields.append("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
    fields.append("config_revision = config_revision + 1")
    db.execute(
        f"UPDATE accounts SET {', '.join(fields)} WHERE id = ? AND user_id = ?",
        [*values.values(), account_id, user_id],
    )


def replace_key(db: DBConnection, params: Sequence[object]) -> DBCursor:
    return db.execute("""
        UPDATE accounts SET
            key_prefix = ?,
            key_hash = ?,
            key_encrypted = ?,
            key_environment = ?,
            key_revoked = 0,
            key_created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            key_last_used_at = NULL,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
        """, params)
