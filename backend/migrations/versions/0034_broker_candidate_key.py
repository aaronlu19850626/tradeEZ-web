"""Add stable broker key to timezone candidates."""
from __future__ import annotations

from pathlib import Path

from alembic import op

revision = "0034_broker_candidate_key"
down_revision = "0033_timezone_backfill"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError("Broker candidate key downgrade is not supported")
