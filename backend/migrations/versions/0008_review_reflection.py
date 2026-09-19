from alembic import op

revision = "0008_review_reflection"
down_revision = "0007_account_notes"
branch_labels = depends_on = None


def upgrade():
    op.execute("ALTER TABLE trade_reviews ADD COLUMN reflection_json TEXT NOT NULL DEFAULT '{}'")


def downgrade():
    raise RuntimeError("Please restore a verified backup to preserve structured reviews")
