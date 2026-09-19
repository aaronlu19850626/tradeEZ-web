from alembic import op

revision = "0016_weekly_reviews_actions"
down_revision = "0015_workspace_settings"
branch_labels = depends_on = None


def upgrade():
    op.execute("""CREATE TABLE weekly_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,week_start TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','completed')),
        answers_json TEXT NOT NULL,summary_json TEXT NOT NULL,source_hash TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,UNIQUE(user_id,week_start))""")
    op.execute("""CREATE TABLE improvement_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,weekly_review_id INTEGER,
        title TEXT NOT NULL,success_measure TEXT NOT NULL DEFAULT '',target_date TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','abandoned')),
        outcome TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(weekly_review_id) REFERENCES weekly_reviews(id) ON DELETE SET NULL)""")
    op.execute("CREATE INDEX idx_weekly_reviews_user_week ON weekly_reviews(user_id,week_start)")
    op.execute("CREATE INDEX idx_improvement_actions_user_status ON improvement_actions(user_id,status)")


def downgrade():
    raise RuntimeError("Please restore a verified backup to preserve weekly reviews and actions")
