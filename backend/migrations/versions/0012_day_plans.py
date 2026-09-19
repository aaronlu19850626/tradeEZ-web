from alembic import op

revision = "0012_day_plans"
down_revision = "0011_review_evaluations"
branch_labels = depends_on = None


def upgrade():
    op.execute("""CREATE TABLE day_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        plan_date TEXT NOT NULL,
        timezone TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('trade','observe','rest')),
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','confirmed')),
        content_json TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        first_confirmed_at TEXT,
        confirmed_at TEXT,
        confirmed_late INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        UNIQUE(user_id,account_id,plan_date)
    )""")
    op.execute("""CREATE TABLE day_plan_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        content_json TEXT NOT NULL,
        change_reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(plan_id) REFERENCES day_plans(id) ON DELETE CASCADE,
        UNIQUE(plan_id,revision)
    )""")
    op.execute("CREATE INDEX idx_day_plans_user_date ON day_plans(user_id,plan_date)")


def downgrade():
    raise RuntimeError("Please restore a verified backup to preserve day plans")
