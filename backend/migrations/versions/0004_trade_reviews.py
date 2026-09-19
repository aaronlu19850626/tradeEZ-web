"""Human review data survives derived-trade rebuilds and account resynchronization."""
from alembic import op

revision = "0004_trade_reviews"
down_revision = "0003_account_resync"
branch_labels = depends_on = None


def upgrade():
    op.execute("""CREATE TABLE trade_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        position_id INTEGER NOT NULL,
        anchor_ticket INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft','reviewed')),
        notes TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]',
        source_hash TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE(account_id,position_id,anchor_ticket)
    )""")
    op.execute("CREATE INDEX idx_reviews_account_updated ON trade_reviews(account_id,updated_at,id)")


def downgrade():
    raise RuntimeError("Please restore a verified backup to preserve human review data")
