"""Add the closed_trades projection table and lazy refresh routines."""
from __future__ import annotations

from pathlib import Path

from alembic import op

revision = "0038_closed_trades"
down_revision = "0037_trade_query_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError("Closed trades projection downgrade is not supported")
