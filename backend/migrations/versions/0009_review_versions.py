from alembic import op

revision = "0009_review_versions"
down_revision = "0008_review_reflection"
branch_labels = depends_on = None


def upgrade():
    op.execute("""CREATE TABLE review_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_id INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft','reviewed')),
        notes TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        reflection_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(review_id) REFERENCES trade_reviews(id) ON DELETE CASCADE,
        UNIQUE(review_id, revision)
    )""")
    op.execute("CREATE INDEX idx_review_versions_review ON review_versions(review_id, revision DESC)")
    op.execute("""INSERT INTO review_versions(review_id,revision,status,notes,tags_json,source_hash,reflection_json,created_at)
        SELECT id,revision,status,notes,tags_json,source_hash,reflection_json,updated_at FROM trade_reviews""")


def downgrade():
    raise RuntimeError("Please restore a verified backup to preserve review history")
