"""Add raw MT5 server times and internal broker timezone resolution."""
from __future__ import annotations

from pathlib import Path

from alembic import op

revision = "0032_server_timezone_resolution"
down_revision = "0031_account_currency"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError("Server timezone resolution downgrade is not supported")
