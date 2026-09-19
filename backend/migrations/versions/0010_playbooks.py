from alembic import op

revision = "0010_playbooks"
down_revision = "0009_review_versions"
branch_labels = depends_on = None


def upgrade():
    op.execute("""CREATE TABLE setups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        symbols_json TEXT NOT NULL DEFAULT '[]',
        directions_json TEXT NOT NULL DEFAULT '["buy","sell"]',
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id,name)
    )""")
    op.execute("""CREATE TABLE playbook_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setup_id INTEGER NOT NULL,
        version INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
        revision INTEGER NOT NULL DEFAULT 0,
        content_json TEXT NOT NULL DEFAULT '{}',
        rules_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        published_at TEXT,
        FOREIGN KEY(setup_id) REFERENCES setups(id) ON DELETE CASCADE,
        UNIQUE(setup_id,version)
    )""")
    op.execute("CREATE UNIQUE INDEX idx_playbook_one_draft ON playbook_versions(setup_id) WHERE status='draft'")
    op.execute("CREATE INDEX idx_setups_user_status ON setups(user_id,status)")


def downgrade():
    raise RuntimeError("Please restore a verified backup to preserve playbooks")
