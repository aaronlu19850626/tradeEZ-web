"""Make the account currency a required user-managed property."""
from __future__ import annotations

from pathlib import Path

from alembic import op

revision = "0031_account_currency"
down_revision = "0030_connector_unified"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError("Account currency downgrade is not supported")
