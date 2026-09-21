"""Track automatic timezone normalization state on accounts."""
from __future__ import annotations

from pathlib import Path

from alembic import op

revision = "0035_timezone_normalization_state"
down_revision = "0034_broker_candidate_key"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError("Timezone normalization state downgrade is not supported")
