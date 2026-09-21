"""Index heartbeat_history by time so retention pruning stays cheap."""
from __future__ import annotations

from pathlib import Path

from alembic import op

revision = "0027_heartbeat_history_retention"
down_revision = "0026_margin_level_nullable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError("Heartbeat history retention downgrade is not supported")
