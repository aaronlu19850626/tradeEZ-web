from alembic import op

revision = "0015_workspace_settings"
down_revision = "0014_daily_reviews"
branch_labels = depends_on = None


def upgrade():
    op.execute("""CREATE TABLE workspace_settings (
        user_id INTEGER PRIMARY KEY,
        display_timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
        trading_day_start TEXT NOT NULL DEFAULT '00:00',
        default_session TEXT NOT NULL DEFAULT '全天',
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )""")


def downgrade():
    raise RuntimeError("Please restore a verified backup to preserve workspace settings")
