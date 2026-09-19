"""PostgreSQL dirty-position trigger.

Restores the SQLite trigger behaviour that marked affected MT5 positions for
rebuild whenever deal facts were inserted, updated, or deleted.
"""
from __future__ import annotations

from pathlib import Path

from alembic import op

revision = "0023_trade_dirty_triggers"
down_revision = "0022_postgresql_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql_path = Path(__file__).with_suffix(".sql")
    op.execute(sql_path.read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError("Trade dirty trigger downgrade is not supported")