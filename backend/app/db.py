from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi import Request

SCHEMA_SQL = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS auth_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'login',
    expires_at INTEGER NOT NULL,
    consumed INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_auth_codes_email_time
    ON auth_codes(email, created_at);

CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mt5_login INTEGER NOT NULL UNIQUE,
    label TEXT,
    broker_server TEXT,
    broker_company TEXT,
    account_currency TEXT,
    server_gmt_off INTEGER,
    key_prefix TEXT NOT NULL UNIQUE,
    key_hash TEXT NOT NULL,
    key_encrypted TEXT,
    key_environment TEXT NOT NULL DEFAULT 'live',
    key_created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    key_last_used_at TEXT,
    key_revoked INTEGER NOT NULL DEFAULT 0,
    last_sync_time INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_seen_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_login INTEGER NOT NULL,
    ticket INTEGER NOT NULL,
    position_id INTEGER NOT NULL DEFAULT 0,
    order_id INTEGER NOT NULL DEFAULT 0,
    symbol TEXT NOT NULL DEFAULT '',
    entry INTEGER NOT NULL DEFAULT 0,
    type INTEGER NOT NULL DEFAULT 0,
    volume REAL NOT NULL,
    price REAL NOT NULL,
    sl_price REAL NOT NULL DEFAULT 0,
    tp_price REAL NOT NULL DEFAULT 0,
    profit REAL NOT NULL DEFAULT 0,
    swap REAL NOT NULL DEFAULT 0,
    commission REAL NOT NULL DEFAULT 0,
    magic INTEGER NOT NULL DEFAULT 0,
    comment TEXT NOT NULL DEFAULT '',
    open_time INTEGER NOT NULL DEFAULT 0,
    deal_time INTEGER NOT NULL,
    server_gmt_off INTEGER NOT NULL DEFAULT 0,
    raw_json TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(account_login, ticket)
);
CREATE INDEX IF NOT EXISTS idx_deals_account_time ON deals(account_login, deal_time);
CREATE INDEX IF NOT EXISTS idx_deals_account_position ON deals(account_login, position_id);

CREATE TABLE IF NOT EXISTS symbols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_login INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    digits INTEGER NOT NULL,
    point REAL NOT NULL,
    contract_size REAL NOT NULL,
    tick_value REAL NOT NULL,
    tick_size REAL NOT NULL DEFAULT 0,
    currency_base TEXT NOT NULL DEFAULT '',
    currency_profit TEXT NOT NULL DEFAULT '',
    raw_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(account_login, symbol)
);
CREATE INDEX IF NOT EXISTS idx_symbols_account ON symbols(account_login);

CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_login INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    balance REAL NOT NULL,
    equity REAL NOT NULL,
    margin REAL NOT NULL DEFAULT 0,
    free_margin REAL NOT NULL DEFAULT 0,
    margin_level REAL NOT NULL DEFAULT 0,
    raw_json TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(account_login, timestamp)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_account_time ON snapshots(account_login, timestamp);

CREATE TABLE IF NOT EXISTS heartbeat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_login INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    version TEXT,
    received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_heartbeat_history_account_time
    ON heartbeat_history(account_login, timestamp);

CREATE TABLE IF NOT EXISTS heartbeats (
    account_login INTEGER PRIMARY KEY,
    server_gmt_off INTEGER,
    account_currency TEXT,
    broker_company TEXT,
    broker_server TEXT,
    ea_version TEXT,
    payload TEXT NOT NULL,
    last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
"""


def _column_names(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _add_column_if_missing(conn: sqlite3.Connection, table: str, columns: set[str], name: str, ddl: str) -> None:
    if name not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")


def init_db(db_path: str) -> None:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.executescript(SCHEMA_SQL)
        account_columns = _column_names(conn, "accounts")
        _add_column_if_missing(conn, "accounts", account_columns, "last_sync_time", "last_sync_time INTEGER NOT NULL DEFAULT 0")
        _add_column_if_missing(conn, "accounts", account_columns, "key_encrypted", "key_encrypted TEXT")
        _add_column_if_missing(conn, "accounts", account_columns, "key_environment", "key_environment TEXT NOT NULL DEFAULT 'live'")
        _add_column_if_missing(conn, "accounts", account_columns, "key_created_at", "key_created_at TEXT")
        _add_column_if_missing(conn, "accounts", account_columns, "key_last_used_at", "key_last_used_at TEXT")
        _add_column_if_missing(conn, "accounts", account_columns, "updated_at", "updated_at TEXT")

        deal_columns = _column_names(conn, "deals")
        _add_column_if_missing(conn, "deals", deal_columns, "open_time", "open_time INTEGER NOT NULL DEFAULT 0")
        conn.execute("UPDATE deals SET open_time = deal_time WHERE open_time = 0 OR open_time IS NULL")
        _add_column_if_missing(conn, "deals", deal_columns, "server_gmt_off", "server_gmt_off INTEGER NOT NULL DEFAULT 0")
        conn.execute("UPDATE deals SET server_gmt_off = 0")

        conn.execute("CREATE INDEX IF NOT EXISTS idx_accounts_last_sync_time ON accounts(last_sync_time)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_deals_account_open_time ON deals(account_login, open_time)")


def get_db(request: Request) -> sqlite3.Connection:
    return request.app.state.db
