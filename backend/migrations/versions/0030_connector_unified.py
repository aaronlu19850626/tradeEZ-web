"""Add the unified connector session and typed event tables."""
from __future__ import annotations

from pathlib import Path

from alembic import op

revision = "0030_connector_unified"
down_revision = "0029_account_platform"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError("Connector unified schema downgrade is not supported")
