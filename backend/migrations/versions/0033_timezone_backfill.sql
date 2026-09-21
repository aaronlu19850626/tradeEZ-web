ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS timezone_backfill_required BIGINT NOT NULL DEFAULT 0;
