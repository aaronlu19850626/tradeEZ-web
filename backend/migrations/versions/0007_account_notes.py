from alembic import op

revision = "0007_account_notes"
down_revision = "0006_phone_auth"
branch_labels = depends_on = None


def upgrade():
    op.execute("ALTER TABLE accounts ADD COLUMN notes TEXT")
    op.execute("ALTER TABLE accounts ADD COLUMN config_revision INTEGER NOT NULL DEFAULT 0")


def downgrade():
    raise RuntimeError("Please restore a verified backup to preserve account notes")
