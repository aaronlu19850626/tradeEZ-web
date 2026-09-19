from __future__ import annotations

import sqlite3
from collections.abc import Iterator

from .config import get_settings
from .migrations import upgrade_database


def init_db(db_path: str) -> None:
    """Apply versioned migrations for new and existing SQLite databases."""
    upgrade_database(db_path)


def get_db() -> Iterator[sqlite3.Connection]:
    """Create one short-lived SQLite connection per FastAPI request.

    SQLite connections must not be shared across concurrent async requests.
    ``isolation_level=None`` puts the driver in autocommit mode so explicit
    ``BEGIN IMMEDIATE`` blocks in ingestion endpoints behave deterministically.
    """
    conn = sqlite3.connect(
        get_settings().db_path,
        check_same_thread=False,
        timeout=30,
        isolation_level=None,
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=30000")
    try:
        yield conn
    finally:
        conn.close()
