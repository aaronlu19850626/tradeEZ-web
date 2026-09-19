"""PostgreSQL connection helpers for TradeSync.

The application historically used sqlite3's short-lived connection style. This
module provides the same ``execute``/``lastrowid``/mapping-row programming model
on top of psycopg 3, while translating only the small amount of SQLite-specific
SQL still present during the PostgreSQL migration. New code should use native
PostgreSQL SQL.
"""
from __future__ import annotations

from collections.abc import Iterator, Mapping, Sequence
import re
from typing import Any

import psycopg

from .config import get_settings


class DBRow(dict):
    """A row supporting both named and SQLite-style positional access."""

    def __init__(self, values: Sequence[Any], columns: Sequence[str]):
        super().__init__(zip(columns, values))
        self._values = tuple(values)

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, slice):
            return self._values[key]
        if isinstance(key, int):
            return self._values[key]
        return super().__getitem__(key)

    def __iter__(self):
        # Match sqlite3.Row: tuple(row) yields values rather than column names.
        return iter(self._values)


def _row_factory(cursor: "DBCursor"):
    columns = [item.name for item in (cursor.description or [])]

    def make_row(values: Sequence[Any] | None):
        if values is None:
            return None
        return DBRow(values, columns)

    return make_row


_STRFTIME_RE = re.compile(r"strftime\s*\(\s*'[^']*'\s*,\s*'now'\s*\)", re.I)
_DATE_UNIX_RE = re.compile(r"\bdate\s*\(\s*([A-Za-z_][\w.]*)\s*,\s*'unixepoch'\s*\)", re.I)
_JSON_EXTRACT_RE = re.compile(r"json_extract\s*\(\s*([A-Za-z_][\w.]*)\s*,\s*'\$\.([A-Za-z_][\w]*)'\s*\)", re.I)
_JSON_EACH_JOIN_RE = re.compile(r"\bJOIN\s+json_each\s*\(\s*([^)]*?)\s*\)\s+(?:AS\s+)?([A-Za-z_]\w*)\b", re.I)
_JSON_EACH_ALIAS_RE = re.compile(r"\bjson_each\s*\(\s*([^)]*?)\s*\)\s+(?:AS\s+)?(?!(?:WHERE|GROUP|ORDER|LIMIT|OFFSET|HAVING|ON|JOIN)\b)([A-Za-z_]\w*)\b", re.I)
_JSON_EACH_RE = re.compile(r"\bjson_each\s*\(\s*([^)]*?)\s*\)", re.I)
_INSERT_OR_IGNORE_RE = re.compile(r"^\s*INSERT\s+OR\s+IGNORE\s+INTO\b", re.I | re.S)
_INSERT_RE = re.compile(r"^\s*INSERT(?:\s+OR\s+(?:REPLACE|ABORT|FAIL|ROLLBACK))?\s+INTO\b", re.I | re.S)
_SUM_BOOLEAN_RE = re.compile(r"\bSUM\s*\(\s*([^()]*?\s*(?:=|<>|!=)\s*[^()]*?)\s*\)", re.I)
_INSERT_TARGET_RE = re.compile(r"^\s*INSERT(?:\s+OR\s+(?:IGNORE|REPLACE|ABORT|FAIL|ROLLBACK))?\s+INTO\s+([A-Za-z_][\w.]*)", re.I | re.S)

# Tables without an INTEGER-style ``id`` column must not be given an implicit
# RETURNING id clause.
_NO_ID_TABLES = {
    "alembic_version",
    "heartbeats",
    "trade_allocations",
    "trade_dirty_positions",
    "workspace_settings",
}


def _adapt_params(params: Any) -> Any:
    """Convert values that SQLite accepted but PostgreSQL represents differently."""
    if isinstance(params, bool):
        return int(params)
    if isinstance(params, (str, bytes, int, float)) or params is None:
        return params
    if isinstance(params, Mapping):
        return {key: _adapt_params(value) for key, value in params.items()}
    if isinstance(params, Sequence):
        return tuple(_adapt_params(value) for value in params)
    return params


def _escape_literal_percent(sql: str) -> str:
    """Escape literal percent signs while preserving generated %s placeholders."""
    return re.sub(r"%(?!s\b)", "%%", sql)


def _insert_target(query: str) -> str | None:
    match = _INSERT_TARGET_RE.match(query.strip())
    if not match:
        return None
    return match.group(1).split(".")[-1].lower()


def _translate(query: str, *, has_params: bool = False) -> str:
    original = query.strip()
    sql_text = original

    # Application timestamps are stored as ISO-8601 text, matching the old schema.
    sql_text = _STRFTIME_RE.sub("now_iso()", sql_text)
    sql_text = _DATE_UNIX_RE.sub(r"(to_timestamp(\1) AT TIME ZONE 'UTC')::date", sql_text)
    sql_text = _JSON_EXTRACT_RE.sub(r"(\1::jsonb ->> '\2')", sql_text)
    sql_text = _JSON_EACH_JOIN_RE.sub(r"CROSS JOIN LATERAL jsonb_array_elements_text((\1)::jsonb) AS \2(value)", sql_text)
    sql_text = _JSON_EACH_ALIAS_RE.sub(r"jsonb_array_elements_text((\1)::jsonb) AS \2(value)", sql_text)
    sql_text = _JSON_EACH_RE.sub(r"jsonb_array_elements_text((\1)::jsonb)", sql_text)
    sql_text = re.sub(r"\b([A-Za-z_]\w*)\.type\s*=\s*'text'", "TRUE", sql_text, flags=re.I)
    def sum_boolean(match: re.Match[str]) -> str:
        expression = match.group(1)
        if re.search(r"\bCASE\b", expression, flags=re.I):
            return match.group(0)
        return f"SUM(CASE WHEN {expression} THEN 1 ELSE 0 END)"

    sql_text = _SUM_BOOLEAN_RE.sub(sum_boolean, sql_text)
    sql_text = sql_text.replace("BEGIN IMMEDIATE", "BEGIN")
    sql_text = sql_text.replace("INSERT OR IGNORE INTO", "INSERT INTO")
    sql_text = sql_text.replace("?", "%s")

    target = _insert_target(original)
    is_insert_or_ignore = bool(_INSERT_OR_IGNORE_RE.match(original))
    is_insert = bool(_INSERT_RE.match(original))

    if is_insert_or_ignore and not re.search(r"\bON\s+CONFLICT\b", sql_text, flags=re.I):
        sql_text = re.sub(r";\s*$", "", sql_text.rstrip())
        sql_text += "\nON CONFLICT DO NOTHING"

    if (
        is_insert
        and target not in _NO_ID_TABLES
        and not re.search(r"\bRETURNING\b", sql_text, flags=re.I)
    ):
        sql_text = re.sub(r";\s*$", "", sql_text.rstrip())
        sql_text += "\nRETURNING id"

    return _escape_literal_percent(sql_text) if has_params else sql_text


class DBCursor(psycopg.Cursor):
    def __init__(self, *args: Any, **kwargs: Any):
        super().__init__(*args, **kwargs)
        self.lastrowid: int | None = None

    def execute(self, query: str, params: Any = None, *, prepare: bool | None = None, binary: bool | None = None) -> "DBCursor":
        adapted_params = _adapt_params(params)
        translated = _translate(query, has_params=params is not None)
        try:
            super().execute(translated, adapted_params, prepare=prepare, binary=binary)
        except Exception:
            self.lastrowid = None
            raise
        self.lastrowid = None
        if translated.lstrip().upper().startswith("INSERT") and self.description:
            rows = super().fetchall()
            self.lastrowid = int(rows[0][0]) if rows else None
        return self

    def executemany(self, query: str, params_seq: Any, *, returning: bool = False) -> "DBCursor":
        translated = _translate(query, has_params=True)
        # Bulk callers do not need generated ids. Keeping RETURNING would force
        # psycopg to queue every result row.
        translated = re.sub(r"\s+RETURNING\s+id\s*$", "", translated, flags=re.I)
        adapted = (_adapt_params(params) for params in params_seq)
        return super().executemany(translated, adapted, returning=returning)


class DBConnection(psycopg.Connection):
    def execute(self, query: str, params: Any = None, *, prepare: bool | None = None, binary: bool | None = None) -> DBCursor:
        cursor = self.cursor()
        return cursor.execute(query, params, prepare=prepare, binary=binary)

    def executemany(self, query: str, params_seq: Any, *, returning: bool = False) -> DBCursor:
        cursor = self.cursor()
        return cursor.executemany(query, params_seq, returning=returning)

    @property
    def in_transaction(self) -> bool:
        return bool(self.info.transaction_status & psycopg.pq.TransactionStatus.INTRANS)


def database_url() -> str:
    url = get_settings().database_url.strip()
    if not url:
        raise RuntimeError(
            "TRADESYNC_DATABASE_URL is required, for example "
            "postgresql://tradeez:***@127.0.0.1:5432/tradeez"
        )
    # SQLAlchemy-style URLs are convenient in documentation; libpq does not use
    # the +driver suffix.
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


def connect_db(*, autocommit: bool = True, application_name: str = "tradesync-api") -> DBConnection:
    return DBConnection.connect(
        database_url(),
        autocommit=autocommit,
        application_name=application_name,
        connect_timeout=15,
        row_factory=_row_factory,
        cursor_factory=DBCursor,
    )


def init_db(_: str | None = None) -> None:
    """Create the current PostgreSQL baseline schema when needed."""
    from .migrations import upgrade_database

    upgrade_database(get_settings().database_url)


def get_db() -> Iterator[DBConnection]:
    conn = connect_db(application_name="tradesync-request")
    try:
        yield conn
    finally:
        conn.close()
