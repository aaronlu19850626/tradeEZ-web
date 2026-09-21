"""Per-user UI preferences (column selection and similar)."""
from __future__ import annotations

from pathlib import Path

from alembic import op

revision = "0028_user_preferences"
down_revision = "0027_heartbeat_history_retention"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError("User preference downgrade is not supported")
