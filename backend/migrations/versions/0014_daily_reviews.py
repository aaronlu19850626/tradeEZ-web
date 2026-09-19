from alembic import op

revision = "0014_daily_reviews"
down_revision = "0013_trade_intentions"
branch_labels = depends_on = None


def upgrade():
    op.execute("""CREATE TABLE daily_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        review_date TEXT NOT NULL,
        timezone TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','completed')),
        answers_json TEXT NOT NULL,
        summary_json TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        first_completed_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        UNIQUE(user_id,account_id,review_date)
    )""")
    op.execute("""CREATE TABLE daily_review_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_id INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        status TEXT NOT NULL,
        answers_json TEXT NOT NULL,
        summary_json TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(review_id) REFERENCES daily_reviews(id) ON DELETE CASCADE,
        UNIQUE(review_id,revision)
    )""")
    op.execute("CREATE INDEX idx_daily_reviews_user_date ON daily_reviews(user_id,review_date)")


def downgrade():
    raise RuntimeError("Please restore a verified backup to preserve daily reviews")
