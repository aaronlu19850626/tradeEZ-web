from alembic import op

revision = "0013_trade_intentions"
down_revision = "0012_day_plans"
branch_labels = depends_on = None


def upgrade():
    op.execute("""CREATE TABLE trade_intentions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        day_plan_id INTEGER,
        scenario_id TEXT,
        playbook_version_id INTEGER,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('buy','sell')),
        state TEXT NOT NULL CHECK(state IN ('watching','prepared','executed_unlinked','linked','abandoned','invalidated','expired')),
        entry_basis TEXT NOT NULL DEFAULT '',
        risk_plan TEXT NOT NULL DEFAULT '',
        linked_trade_id INTEGER UNIQUE,
        linked_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        FOREIGN KEY(day_plan_id) REFERENCES day_plans(id) ON DELETE SET NULL,
        FOREIGN KEY(playbook_version_id) REFERENCES playbook_versions(id),
        FOREIGN KEY(linked_trade_id) REFERENCES trade_lifecycles(id) ON DELETE SET NULL
    )""")
    op.execute("""CREATE TABLE intention_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        intention_id INTEGER NOT NULL,
        from_state TEXT,
        to_state TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(intention_id) REFERENCES trade_intentions(id) ON DELETE CASCADE
    )""")
    op.execute("CREATE INDEX idx_intentions_user_account_state ON trade_intentions(user_id,account_id,state)")


def downgrade():
    raise RuntimeError("Please restore a verified backup to preserve trade intentions")
