from alembic import op

revision = "0021_account_key_rotation_audits"
down_revision = "0020_trade_reconciliation_cases"
branch_labels = depends_on = None


def upgrade():
    op.execute("""CREATE TABLE account_key_rotation_audits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,account_id INTEGER NOT NULL,
        mt5_login TEXT NOT NULL,old_prefix TEXT NOT NULL,new_prefix TEXT NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('manual','reset_sync')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)""")
    op.execute("CREATE INDEX idx_key_rotation_audits_user_time ON account_key_rotation_audits(user_id,created_at DESC)")


def downgrade():
    op.drop_table("account_key_rotation_audits")
