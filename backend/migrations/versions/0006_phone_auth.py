from alembic import op

revision = "0006_phone_auth"
down_revision = "0005_review_attachments"
branch_labels = depends_on = None


def upgrade():
    # Additive migration preserves parent user IDs and every account/review FK.
    # Legacy users.email doubles as a unique login identity for phone-only users
    # (phone:+86...). It is never exposed as an email or sent to SMTP.
    op.execute("ALTER TABLE users ADD COLUMN phone TEXT")
    op.execute("CREATE UNIQUE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL")
    op.execute("ALTER TABLE auth_codes ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'sent'")
    op.execute("ALTER TABLE auth_codes ADD COLUMN test_mode INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE auth_codes ADD COLUMN request_ip_hash TEXT")
    op.execute("CREATE INDEX idx_auth_codes_ip_time ON auth_codes(request_ip_hash,created_at)")
    op.execute("CREATE INDEX idx_auth_codes_time ON auth_codes(created_at)")
    # Old fixed challenges were not labelled; require a new request on upgrade.
    op.execute("UPDATE auth_codes SET consumed=1 WHERE consumed=0")


def downgrade():
    raise RuntimeError("Please restore a verified backup to preserve phone identities")
