ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS timezone_profile_id BIGINT,
    ADD COLUMN IF NOT EXISTS timezone_normalized_at TEXT,
    ADD COLUMN IF NOT EXISTS timezone_normalization_revision BIGINT NOT NULL DEFAULT 0;
