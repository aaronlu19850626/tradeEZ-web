"""Add the account market color profile."""
from __future__ import annotations

from pathlib import Path

from alembic import op

revision = "0039_account_market_profile"
down_revision = "0038_closed_trades"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError("Account market profile downgrade is not supported")
