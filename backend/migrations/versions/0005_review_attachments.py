from alembic import op

revision = "0005_review_attachments"
down_revision = "0004_trade_reviews"
branch_labels = depends_on = None


def upgrade():
    op.execute("""CREATE TABLE review_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_id INTEGER NOT NULL REFERENCES trade_reviews(id) ON DELETE CASCADE,
        data BLOB NOT NULL,
        sha256 TEXT NOT NULL,
        size INTEGER NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE(review_id,sha256)
    )""")
    op.execute("CREATE INDEX idx_attachments_review ON review_attachments(review_id)")


def downgrade():
    raise RuntimeError("Please restore a verified backup to preserve attachments")
