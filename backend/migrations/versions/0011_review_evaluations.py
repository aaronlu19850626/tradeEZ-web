from alembic import op

revision = "0011_review_evaluations"
down_revision = "0010_playbooks"
branch_labels = depends_on = None


def upgrade():
    op.execute("""CREATE TABLE review_evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_id INTEGER NOT NULL UNIQUE,
        playbook_version_id INTEGER NOT NULL,
        answers_json TEXT NOT NULL DEFAULT '[]',
        complete INTEGER NOT NULL DEFAULT 0,
        coverage REAL,
        score REAL,
        compliance TEXT NOT NULL DEFAULT 'insufficient',
        critical_failures_json TEXT NOT NULL DEFAULT '[]',
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(review_id) REFERENCES trade_reviews(id) ON DELETE CASCADE,
        FOREIGN KEY(playbook_version_id) REFERENCES playbook_versions(id)
    )""")
    op.execute("""CREATE TABLE review_evaluation_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evaluation_id INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        playbook_version_id INTEGER NOT NULL,
        answers_json TEXT NOT NULL,
        complete INTEGER NOT NULL,
        coverage REAL,
        score REAL,
        compliance TEXT NOT NULL,
        critical_failures_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(evaluation_id) REFERENCES review_evaluations(id) ON DELETE CASCADE,
        FOREIGN KEY(playbook_version_id) REFERENCES playbook_versions(id),
        UNIQUE(evaluation_id,revision)
    )""")


def downgrade():
    raise RuntimeError("Please restore a verified backup to preserve rule evaluations")
