"""Snapshot margin_level can be NULL when margin is zero."""
from __future__ import annotations

from pathlib import Path

from alembic import op

revision = "0026_margin_level_nullable"
down_revision = "0025_account_imports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError("Snapshot margin_level downgrade is not supported")
