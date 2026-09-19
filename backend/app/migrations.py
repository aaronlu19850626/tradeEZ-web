"""Alembic entry point shared by application startup and the CLI."""
from __future__ import annotations

from pathlib import Path
from threading import RLock
import sqlite3
import time

from alembic import command
from alembic.config import Config
from sqlalchemy import URL, create_engine, event
from sqlalchemy.pool import NullPool

BACKEND_ROOT = Path(__file__).resolve().parents[1]
_migration_lock = RLock()


def enable_wal(connection) -> None:
    """SQLite may skip the busy handler during concurrent journal-mode changes."""
    deadline = time.monotonic() + 30
    connection.execute("PRAGMA busy_timeout=1000")
    try:
        while True:
            try:
                connection.execute("PRAGMA journal_mode=WAL").fetchone()
                return
            except sqlite3.OperationalError as exc:
                error = getattr(exc, "sqlite_errorcode", 0) & 0xFF
                if error not in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED) or time.monotonic() >= deadline:
                    raise
                time.sleep(0.05)
    finally:
        connection.execute("PRAGMA busy_timeout=30000")


def migration_config() -> Config:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "migrations").replace("%", "%%"))
    return config


def migration_engine(db_path: str):
    path = Path(db_path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        URL.create("sqlite", database=str(path)),
        poolclass=NullPool,
        connect_args={"timeout": 30},
    )

    @event.listens_for(engine, "connect")
    def configure_connection(connection, _record):
        connection.isolation_level = None
        connection.execute("PRAGMA busy_timeout=30000")
        connection.execute("PRAGMA foreign_keys=ON")
        enable_wal(connection)

    @event.listens_for(engine, "begin")
    def begin_transaction(connection):
        # Lock before Alembic reads its version table, including concurrent starts.
        connection.exec_driver_sql("BEGIN IMMEDIATE")

    return engine


def upgrade_database(db_path: str) -> None:
    # Alembic's environment proxy is process-global; serialize local invocations.
    with _migration_lock:
        engine = migration_engine(db_path)
        try:
            with engine.begin() as connection:
                config = migration_config()
                config.attributes["connection"] = connection
                command.upgrade(config, "head")
        finally:
            engine.dispose()
