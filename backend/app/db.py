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
    key_revoked INTEGER NOT NULL DEFAULT 0,
    last_sync_time INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_seen_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_login INTEGER NOT NULL,
    ticket INTEGER NOT NULL,
    position_id INTEGER,
    order_id INTEGER,
    symbol TEXT,
    entry INTEGER NOT NULL DEFAULT 0,
    type INTEGER NOT NULL DEFAULT 0,
    volume REAL NOT NULL,
    price REAL NOT NULL,
    sl_price REAL,
    tp_price REAL,
    profit REAL NOT NULL DEFAULT 0,
    swap REAL NOT NULL DEFAULT 0,
    commission REAL NOT NULL DEFAULT 0,
    magic INTEGER NOT NULL DEFAULT 0,
    comment TEXT,
    deal_time INTEGER NOT NULL,
    server_gmt_off INTEGER,
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
    tick_size REAL NOT NULL,
    currency_base TEXT NOT NULL,
    currency_profit TEXT NOT NULL,
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
    margin REAL NOT NULL,
    free_margin REAL NOT NULL,
    margin_level REAL NOT NULL,
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

-- Legacy heartbeat table kept for the current dashboard compatibility.
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


def init_db(db_path: str) -> None:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.executescript(SCHEMA_SQL)
        # Lightweight migration for databases created before API v2.
        account_columns = _column_names(conn, "accounts")
        if "last_sync_time" not in account_columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN last_sync_time INTEGER NOT NULL DEFAULT 0")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_accounts_last_sync_time ON accounts(last_sync_time)")


def get_db(request: Request) -> sqlite3.Connection:
    return request.app.state.db