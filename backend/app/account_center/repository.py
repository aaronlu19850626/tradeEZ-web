from __future__ import annotations

from app.db import DBConnection


LOGIN_SCOPED_TABLES = (
    "sync_batch_refs",
    "deals",
    "snapshots",
    "symbols",
    "ea_settings_history",
    "heartbeat_history",
    "heartbeats",
    "trade_dirty_positions",
)


def find_login(db: DBConnection, mt5_login: int):
    return db.execute(
        "SELECT id, user_id FROM accounts WHERE mt5_login = %s",
        (mt5_login,),
    ).fetchone()


def count_owned(db: DBConnection, user_id: int) -> int:
    return int(
        db.execute("SELECT COUNT(*) FROM accounts WHERE user_id = %s", (user_id,)).fetchone()[0]
    )


def find_owned(db: DBConnection, account_id: int, user_id: int):
    return db.execute(
        "SELECT * FROM accounts WHERE id = %s AND user_id = %s",
        (account_id, user_id),
    ).fetchone()


def lock_owned(db: DBConnection, account_id: int, user_id: int):
    return db.execute(
        "SELECT * FROM accounts WHERE id = %s AND user_id = %s FOR UPDATE",
        (account_id, user_id),
    ).fetchone()


def list_owned(db: DBConnection, user_id: int):
    return db.execute(
        "SELECT * FROM accounts WHERE user_id = %s ORDER BY created_at DESC, id DESC",
        (user_id,),
    ).fetchall()


def find_by_id(db: DBConnection, account_id: int):
    return db.execute("SELECT * FROM accounts WHERE id = %s", (account_id,)).fetchone()


def find_key_prefix(db: DBConnection, prefix: str):
    return db.execute("SELECT 1 FROM accounts WHERE key_prefix = %s", (prefix,)).fetchone()


def insert_account(
    db: DBConnection,
    *,
    user_id: int,
    mt5_login: int,
    name: str,
    platform: str,
    currency: str,
    broker_server: str | None,
    sync_start_time: int,
    key_prefix: str,
    key_hash: str,
    key_encrypted: str,
    key_environment: str,
    is_statistics: int,
):
    return db.execute(
        """
        INSERT INTO accounts (
            user_id, mt5_login, label, platform, broker_server, sync_start_time,
            account_currency, key_prefix, key_hash, key_encrypted, key_environment, is_statistics,
            key_created_at, updated_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now_iso(), now_iso())
        RETURNING id
        """,
        (
            user_id,
            mt5_login,
            name,
            platform,
            broker_server,
            sync_start_time,
            currency,
            key_prefix,
            key_hash,
            key_encrypted,
            key_environment,
            is_statistics,
        ),
    )


def update_name(db: DBConnection, account_id: int, user_id: int, name: str) -> None:
    db.execute(
        """
        UPDATE accounts SET label = %s, updated_at = now_iso(),
               config_revision = config_revision + 1
        WHERE id = %s AND user_id = %s
        """,
        (name, account_id, user_id),
    )


def update_statistics(db: DBConnection, account_id: int, user_id: int, value: bool) -> None:
    db.execute(
        """
        UPDATE accounts SET is_statistics = %s, updated_at = now_iso(),
               config_revision = config_revision + 1
        WHERE id = %s AND user_id = %s
        """,
        (int(value), account_id, user_id),
    )


def replace_key(
    db: DBConnection,
    account_id: int,
    key_prefix: str,
    key_hash: str,
    key_encrypted: str,
    key_environment: str,
) -> None:
    db.execute(
        """
        UPDATE accounts SET
            key_prefix = %s,
            key_hash = %s,
            key_encrypted = %s,
            key_environment = %s,
            key_revoked = 0,
            key_created_at = now_iso(),
            key_last_used_at = NULL,
            updated_at = now_iso()
        WHERE id = %s
        """,
        (key_prefix, key_hash, key_encrypted, key_environment, account_id),
    )


def latest_snapshot(db: DBConnection, mt5_login: int):
    return db.execute(
        """
        SELECT timestamp, balance, equity
          FROM snapshots
         WHERE account_login = %s
         ORDER BY timestamp DESC
         LIMIT 1
        """,
        (mt5_login,),
    ).fetchone()


def latest_heartbeat(db: DBConnection, mt5_login: int):
    return db.execute(
        "SELECT last_seen_at FROM heartbeats WHERE account_login = %s",
        (mt5_login,),
    ).fetchone()


def latest_deal_time(db: DBConnection, mt5_login: int) -> int | None:
    row = db.execute(
        "SELECT MAX(deal_time) AS latest_deal_time FROM deals WHERE account_login = %s",
        (mt5_login,),
    ).fetchone()
    return int(row["latest_deal_time"]) if row is not None and row["latest_deal_time"] is not None else None


def trade_count(db: DBConnection, mt5_login: int) -> int:
    row = db.execute(
        """
        SELECT COUNT(DISTINCT CASE
            WHEN position_id > 0
             AND open_time > 0
             AND TRIM(COALESCE(symbol, '')) <> ''
             AND volume > 0
             AND price > 0
             AND entry IN (0, 2)
            THEN position_id
        END) AS trade_count
          FROM deals
         WHERE account_login = %s
        """,
        (mt5_login,),
    ).fetchone()
    return int(row["trade_count"] or 0)


def delete_login_scoped(db: DBConnection, mt5_login: int, tables: tuple[str, ...]) -> None:
    for table in tables:
        db.execute(f"DELETE FROM {table} WHERE account_login = %s", (mt5_login,))


def delete_account_id_scoped(db: DBConnection, account_id: int, tables: tuple[str, ...]) -> None:
    for table in tables:
        db.execute(f"DELETE FROM {table} WHERE account_id = %s", (account_id,))


def delete_api_logs(db: DBConnection, account_id: int, mt5_login: int) -> None:
    db.execute(
        "DELETE FROM api_logs WHERE account_id = %s OR mt5_login = %s",
        (account_id, mt5_login),
    )


def delete_account_row(db: DBConnection, account_id: int, user_id: int) -> None:
    db.execute("DELETE FROM accounts WHERE id = %s AND user_id = %s", (account_id, user_id))


def reset_connector_state(db: DBConnection, account_id: int, cursor_value: int) -> None:
    connection_filter = "SELECT id FROM connector_connections WHERE account_id = %s"
    db.execute(f"DELETE FROM connector_events WHERE connection_id IN ({connection_filter})", (account_id,))
    db.execute(f"DELETE FROM connector_batches WHERE connection_id IN ({connection_filter})", (account_id,))
    db.execute(
        """
        UPDATE connector_connections
           SET cursor_value = %s,
               cursor_state_json = '{}',
               updated_at = now_iso()
         WHERE account_id = %s
        """,
        (cursor_value, account_id),
    )
