"""PostgreSQL schema bootstrap for TradeSync."""
from __future__ import annotations

from pathlib import Path
from threading import RLock

from alembic.config import Config

from .db import connect_db

BACKEND_ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_ROOT = BACKEND_ROOT / "migrations"
_migration_lock = RLock()
BASELINE_REVISION = "0022_postgresql_baseline"
SCHEMA_VERSION = "0031_account_currency"

_MIGRATION_STEPS = {
    BASELINE_REVISION: (
        "0023_trade_dirty_triggers",
        MIGRATIONS_ROOT / "versions" / "0023_trade_dirty_triggers.sql",
    ),
    "0023_trade_dirty_triggers": (
        "0024_account_center",
        MIGRATIONS_ROOT / "versions" / "0024_account_center.sql",
    ),
    "0024_account_center": (
        "0025_account_imports",
        MIGRATIONS_ROOT / "versions" / "0025_account_imports.sql",
    ),
    "0025_account_imports": (
        "0026_margin_level_nullable",
        MIGRATIONS_ROOT / "versions" / "0026_margin_level_nullable.sql",
    ),
    "0026_margin_level_nullable": (
        "0027_heartbeat_history_retention",
        MIGRATIONS_ROOT / "versions" / "0027_heartbeat_history_retention.sql",
    ),
    "0027_heartbeat_history_retention": (
        "0028_user_preferences",
        MIGRATIONS_ROOT / "versions" / "0028_user_preferences.sql",
    ),
    "0028_user_preferences": (
        "0029_account_platform",
        MIGRATIONS_ROOT / "versions" / "0029_account_platform.sql",
    ),
    "0029_account_platform": (
        "0030_connector_unified",
        MIGRATIONS_ROOT / "versions" / "0030_connector_unified.sql",
    ),
    "0030_connector_unified": (
        SCHEMA_VERSION,
        MIGRATIONS_ROOT / "versions" / "0031_account_currency.sql",
    ),
}


def migration_config() -> Config:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(MIGRATIONS_ROOT).replace("%", "%%"))
    return config


def _table_exists(db, table_name: str) -> bool:
    row = db.execute("SELECT to_regclass(%s)::text AS table_name", (table_name,)).fetchone()
    return row is not None and row[0] is not None


def _current_revision(db) -> str | None:
    if not _table_exists(db, "alembic_version"):
        return None
    row = db.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
    return row[0] if row is not None else None


def upgrade_database(url: str | None = None) -> None:
    """Create or upgrade the PostgreSQL schema used by the application.

    A new database is created from the current baseline SQL and then brought
    forward through idempotent PostgreSQL migrations. Existing 0022 databases
    are upgraded to 0023 on startup.
    """
    with _migration_lock:
        schema_sql = (MIGRATIONS_ROOT / "postgres_schema.sql").read_text(encoding="utf-8")
        steps = _MIGRATION_STEPS
        db = connect_db(autocommit=False, application_name="tradesync-migration")
        try:
            revision = _current_revision(db)
            if revision == SCHEMA_VERSION:
                return
            if revision is not None and revision not in steps:
                raise RuntimeError(
                    f"Unsupported database revision {revision!r}; expected {SCHEMA_VERSION!r}"
                )

            if revision is None:
                occupied = db.execute(
                    """
                    SELECT COUNT(*) AS table_count
                      FROM information_schema.tables
                     WHERE table_schema = current_schema()
                       AND table_type = 'BASE TABLE'
                    """
                ).fetchone()
                if occupied is not None and int(occupied[0]) > 0:
                    raise RuntimeError(
                        "Current PostgreSQL schema already contains tables but alembic_version is missing; "
                        "refusing to create the baseline automatically"
                    )
                db.execute(schema_sql)
                revision = BASELINE_REVISION

            while revision != SCHEMA_VERSION:
                if revision not in steps:
                    raise RuntimeError(
                        f"Unsupported database revision {revision!r}; expected {SCHEMA_VERSION!r}"
                    )
                next_revision, step_path = steps[revision]
                db.execute(step_path.read_text(encoding="utf-8"))
                db.execute(
                    "UPDATE alembic_version SET version_num = %s WHERE version_num = %s",
                    (next_revision, revision),
                )
                revision = next_revision

            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
