"""Track automatic timezone backfill requests."""
from __future__ import annotations

from pathlib import Path

from alembic import op

revision = "0033_timezone_backfill"
down_revision = "0032_server_timezone_resolution"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError("Timezone backfill downgrade is not supported")
