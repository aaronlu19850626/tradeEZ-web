"""Track an account awaiting a newly confirmed synchronization after reset."""
from alembic import op

revision = "0003_account_resync"
down_revision = "0002_trade_lifecycles"
branch_labels = depends_on = None


def upgrade():
    op.execute("ALTER TABLE accounts ADD COLUMN resync_pending INTEGER NOT NULL DEFAULT 0")


def downgrade():
    raise RuntimeError("Use a verified backup to restore the previous schema")
