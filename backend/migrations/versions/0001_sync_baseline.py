"""Frozen schema and legacy adoption baseline. Do not import application models."""
from __future__ import annotations

import sqlite3
from alembic import op

revision = "0001_sync_baseline"
down_revision = None
branch_labels = None
depends_on = None

SCHEMA_SQL = """


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
    server_timezone_name TEXT,
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

CREATE TABLE IF NOT EXISTS ea_settings_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_login INTEGER NOT NULL,
    snapshot_time INTEGER NOT NULL,
    settings_json TEXT NOT NULL,
    group_count INTEGER NOT NULL DEFAULT 0,
    key_count INTEGER NOT NULL DEFAULT 0,
    content_hash TEXT NOT NULL,
    raw_json TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    UNIQUE(account_login, snapshot_time)
);
CREATE INDEX IF NOT EXISTS idx_ea_settings_account_time
    ON ea_settings_history(account_login, snapshot_time DESC);

CREATE TABLE IF NOT EXISTS heartbeat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_login INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    version TEXT,
    received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_heartbeat_history_account_time
    ON heartbeat_history(account_login, timestamp);


CREATE TABLE IF NOT EXISTS api_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    user_id INTEGER,
    account_id INTEGER,
    mt5_login INTEGER,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    action TEXT NOT NULL DEFAULT '',
    status_code INTEGER NOT NULL,
    success INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    item_count INTEGER,
    last_sync_time INTEGER,
    request_summary TEXT NOT NULL DEFAULT '{}',
    response_summary TEXT NOT NULL DEFAULT '{}',
    error_code TEXT,
    error_message TEXT,
    client_ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_logs_user_time ON api_logs(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_account_time ON api_logs(account_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_login_time ON api_logs(mt5_login, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_logs(created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS ea_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    instance_id TEXT NOT NULL,
    display_name TEXT,
    protocol_version TEXT,
    ea_version TEXT,
    last_seen_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(account_id, instance_id)
);
CREATE INDEX IF NOT EXISTS idx_ea_instances_account ON ea_instances(account_id);

CREATE TABLE IF NOT EXISTS sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    instance_id TEXT,
    protocol_version TEXT NOT NULL DEFAULT '2.1',
    status TEXT NOT NULL DEFAULT 'open',
    cursor_start INTEGER NOT NULL DEFAULT 0,
    cursor_end INTEGER,
    expected_batch_count INTEGER,
    received_batch_count INTEGER NOT NULL DEFAULT 0,
    expected_deal_count INTEGER,
    received_deal_count INTEGER NOT NULL DEFAULT 0,
    inserted_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    duplicated_count INTEGER NOT NULL DEFAULT 0,
    rejected_count INTEGER NOT NULL DEFAULT 0,
    checksum TEXT,
    last_error TEXT,
    started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_batch_at TEXT,
    committed_at TEXT,
    finished_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_account_started ON sync_runs(account_id, started_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON sync_runs(status, started_at DESC);

CREATE TABLE IF NOT EXISTS sync_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    sync_run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
    batch_id TEXT NOT NULL,
    batch_index INTEGER NOT NULL,
    batch_count INTEGER NOT NULL,
    item_count INTEGER NOT NULL DEFAULT 0,
    inserted_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    duplicated_count INTEGER NOT NULL DEFAULT 0,
    rejected_count INTEGER NOT NULL DEFAULT 0,
    request_hash TEXT,
    payload_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received',
    retries INTEGER NOT NULL DEFAULT 0,
    received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(account_id, batch_id),
    UNIQUE(sync_run_id, batch_index)
);
CREATE INDEX IF NOT EXISTS idx_sync_batches_run ON sync_batches(sync_run_id, batch_index);

CREATE TABLE IF NOT EXISTS sync_batch_refs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_batch_id INTEGER NOT NULL REFERENCES sync_batches(id) ON DELETE CASCADE,
    account_login INTEGER NOT NULL,
    deal_ticket INTEGER NOT NULL,
    deal_row_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(sync_batch_id, account_login, deal_ticket)
);
CREATE INDEX IF NOT EXISTS idx_sync_batch_refs_batch ON sync_batch_refs(sync_batch_id);
CREATE INDEX IF NOT EXISTS idx_sync_batch_refs_deal ON sync_batch_refs(account_login, deal_ticket);


CREATE TABLE IF NOT EXISTS heartbeats (
    account_login INTEGER PRIMARY KEY,
    server_gmt_off INTEGER,
    account_currency TEXT,
    broker_company TEXT,
    broker_server TEXT,
    ea_version TEXT,
    server_gmt_offset INTEGER,
    server_timezone_name TEXT,
    payload TEXT NOT NULL,
    last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
"""


def _column_names(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _add_column_if_missing(conn: sqlite3.Connection, table: str, columns: set[str], name: str, ddl: str) -> None:
    if name not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")


def upgrade() -> None:
    conn = op.get_bind().connection.driver_connection
    statement = ""
    for line in SCHEMA_SQL.splitlines(keepends=True):
        statement += line
        if sqlite3.complete_statement(statement):
            conn.execute(statement)
            statement = ""
    account_columns = _column_names(conn, "accounts")
    _add_column_if_missing(conn, "accounts", account_columns, "last_sync_time", "last_sync_time INTEGER NOT NULL DEFAULT 0")
    _add_column_if_missing(conn, "accounts", account_columns, "key_encrypted", "key_encrypted TEXT")
    _add_column_if_missing(conn, "accounts", account_columns, "key_environment", "key_environment TEXT NOT NULL DEFAULT 'live'")
    _add_column_if_missing(conn, "accounts", account_columns, "key_created_at", "key_created_at TEXT")
    _add_column_if_missing(conn, "accounts", account_columns, "key_last_used_at", "key_last_used_at TEXT")
    _add_column_if_missing(conn, "accounts", account_columns, "updated_at", "updated_at TEXT")
    _add_column_if_missing(conn, "accounts", account_columns, "server_timezone_name", "server_timezone_name TEXT")
    _add_column_if_missing(conn, "accounts", account_columns, "status", "status TEXT NOT NULL DEFAULT 'active'")
    _add_column_if_missing(conn, "accounts", account_columns, "sync_start_time", "sync_start_time INTEGER NOT NULL DEFAULT 0")
    _add_column_if_missing(conn, "accounts", account_columns, "last_success_sync_at", "last_success_sync_at TEXT")

    heartbeat_columns = _column_names(conn, "heartbeats")
    _add_column_if_missing(conn, "heartbeats", heartbeat_columns, "server_gmt_offset", "server_gmt_offset INTEGER")
    _add_column_if_missing(conn, "heartbeats", heartbeat_columns, "server_timezone_name", "server_timezone_name TEXT")

    # A zero offset without a timezone name came from a pre-timezone EA heartbeat.
    # Keep it unknown until a new EA explicitly reports the MT5 server timezone.
    conn.execute(
        """
        UPDATE accounts
           SET server_gmt_off = NULL
         WHERE COALESCE(TRIM(server_timezone_name), '') = ''
           AND server_gmt_off = 0
        """
    )
    conn.execute(
        """
        UPDATE heartbeats
           SET server_gmt_offset = NULL
         WHERE COALESCE(TRIM(server_timezone_name), '') = ''
           AND server_gmt_offset = 0
        """
    )

    deal_columns = _column_names(conn, "deals")
    _add_column_if_missing(conn, "deals", deal_columns, "open_time", "open_time INTEGER NOT NULL DEFAULT 0")
    conn.execute("UPDATE deals SET open_time = deal_time WHERE open_time = 0 OR open_time IS NULL")
    _add_column_if_missing(conn, "deals", deal_columns, "server_gmt_off", "server_gmt_off INTEGER NOT NULL DEFAULT 0")
    conn.execute("UPDATE deals SET server_gmt_off = 0")

    api_log_columns = _column_names(conn, "api_logs")
    _add_column_if_missing(conn, "api_logs", api_log_columns, "trace_id", "trace_id TEXT")
    _add_column_if_missing(conn, "api_logs", api_log_columns, "sync_run_id", "sync_run_id INTEGER")
    _add_column_if_missing(conn, "api_logs", api_log_columns, "batch_id", "batch_id TEXT")
    _add_column_if_missing(conn, "api_logs", api_log_columns, "inserted_count", "inserted_count INTEGER")
    _add_column_if_missing(conn, "api_logs", api_log_columns, "updated_count", "updated_count INTEGER")
    _add_column_if_missing(conn, "api_logs", api_log_columns, "duplicated_count", "duplicated_count INTEGER")
    _add_column_if_missing(conn, "api_logs", api_log_columns, "rejected_count", "rejected_count INTEGER")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_api_logs_trace ON api_logs(trace_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_api_logs_sync_run ON api_logs(sync_run_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_accounts_last_sync_time ON accounts(last_sync_time)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_deals_account_open_time ON deals(account_login, open_time)")



def downgrade() -> None:
    raise RuntimeError("Baseline downgrade is not supported; restore a pre-migration SQLite backup.")

