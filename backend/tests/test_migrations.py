from __future__ import annotations

from alembic.script import ScriptDirectory

from app.migrations import migration_config


REQUIRED_TABLES = {
    "accounts",
    "alembic_version",
    "deals",
    "heartbeats",
    "review_attachments",
    "sync_batches",
    "sync_runs",
    "trade_lifecycles",
    "users",
}


def test_postgresql_baseline_has_current_revision(pg_db):
    row = pg_db.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
    assert row is not None
    assert row[0] == ScriptDirectory.from_config(migration_config()).get_current_head()


def test_postgresql_baseline_creates_core_tables(pg_db):
    rows = pg_db.execute(
        """
        SELECT table_name
          FROM information_schema.tables
         WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
        """
    ).fetchall()
    assert REQUIRED_TABLES <= {row[0] for row in rows}


def test_postgresql_baseline_is_idempotent(pg_db):
    from app.migrations import upgrade_database

    # A second startup must not try to add existing named constraints.
    upgrade_database()


def test_identity_columns_allow_existing_ids(pg_db):
    pg_db.execute(
        "INSERT INTO users (id, email) VALUES (%s, %s)",
        (990001, "migration-identity@example.com"),
    )
    row = pg_db.execute("SELECT id FROM users WHERE email = %s", ("migration-identity@example.com",)).fetchone()
    assert row[0] == 990001

