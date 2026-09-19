from alembic import op

revision = "0020_trade_reconciliation_cases"
down_revision = "0019_account_maintenance_audit"
branch_labels = depends_on = None


def upgrade():
    op.execute("""CREATE TABLE trade_reconciliation_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,account_id INTEGER NOT NULL,
        position_id TEXT NOT NULL,anchor_ticket TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'open'
            CHECK(state IN ('open','investigating','resolved')),
        resolution TEXT CHECK(resolution IS NULL OR resolution IN ('source_confirmed','awaiting_resync','not_a_trade')),
        note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        UNIQUE(user_id,account_id,position_id,anchor_ticket))""")
    op.execute("""CREATE TABLE trade_reconciliation_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,case_id INTEGER NOT NULL,state TEXT NOT NULL,
        resolution TEXT,note TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(case_id) REFERENCES trade_reconciliation_cases(id) ON DELETE CASCADE)""")
    op.execute("CREATE INDEX idx_trade_cases_user_state ON trade_reconciliation_cases(user_id,state,updated_at DESC)")
    op.execute("CREATE INDEX idx_trade_case_events_case ON trade_reconciliation_events(case_id,id DESC)")


def downgrade():
    op.drop_table("trade_reconciliation_events")
    op.drop_table("trade_reconciliation_cases")
