from alembic import op

revision = "0017_habits_reminders"
down_revision = "0016_weekly_reviews_actions"
branch_labels = depends_on = None


def upgrade():
    op.execute("""CREATE TABLE reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,title TEXT NOT NULL,
        due_at TEXT,status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','snoozed')),
        snoozed_until TEXT,source_type TEXT NOT NULL DEFAULT 'manual',source_id INTEGER,
        revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)""")
    op.execute("CREATE INDEX idx_reminders_user_status_due ON reminders(user_id,status,due_at)")


def downgrade():
    raise RuntimeError("Please restore a verified backup to preserve reminders")
