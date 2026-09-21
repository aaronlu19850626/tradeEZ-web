"""Account import batches and error rows."""
from __future__ import annotations

from pathlib import Path

from alembic import op

revision = "0025_account_imports"
down_revision = "0024_account_center"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError("Account imports downgrade is not supported")
