"""PostgreSQL baseline.

The pre-0022 migration chain was SQLite-specific and is not executed on
PostgreSQL deployments. New PostgreSQL databases are created from
migrations/postgres_schema.sql and stamped with this revision. Future schema
changes must be added as normal PostgreSQL Alembic migrations after this file.
"""
from __future__ import annotations

from pathlib import Path

from alembic import op

revision = "0022_postgresql_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    schema_path = Path(__file__).resolve().parents[1] / "postgres_schema.sql"
    op.execute(schema_path.read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError("Downgrading the PostgreSQL baseline is not supported")
