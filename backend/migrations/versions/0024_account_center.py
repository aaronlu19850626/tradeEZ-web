"""Account center statistics flag.

Adds the per-account statistics membership flag used by the standalone account
management module.
"""
from __future__ import annotations

from pathlib import Path

from alembic import op

revision = "0024_account_center"
down_revision = "0023_trade_dirty_triggers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError("Account center downgrade is not supported")
