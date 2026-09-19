from alembic import op

revision = "0019_account_maintenance_audit"
down_revision = "0018_tag_definitions"
branch_labels = depends_on = None


def upgrade():
    op.execute("""CREATE TABLE account_maintenance_audits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,account_id INTEGER,
        mt5_login TEXT NOT NULL,action TEXT NOT NULL CHECK(action IN ('reset','delete')),
        reason TEXT NOT NULL,sync_start_time INTEGER,counts_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)""")
    op.execute("CREATE INDEX idx_account_maintenance_audits_user_time ON account_maintenance_audits(user_id,created_at DESC)")


def downgrade():
    raise RuntimeError("Please restore a verified backup to preserve account maintenance audits")
