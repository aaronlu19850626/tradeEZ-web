from alembic import op

revision = "0018_tag_definitions"
down_revision = "0017_habits_reminders"
branch_labels = depends_on = None


def upgrade():
    op.execute("""CREATE TABLE tag_definitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,name TEXT NOT NULL,
        group_name TEXT NOT NULL DEFAULT '未分组',status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
        revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,UNIQUE(user_id,name))""")
    op.execute("CREATE INDEX idx_tag_definitions_user_group ON tag_definitions(user_id,group_name,status)")


def downgrade():
    raise RuntimeError("Please restore a verified backup to preserve tag definitions")
