ALTER TABLE broker_timezone_candidates
    ADD COLUMN IF NOT EXISTS min_observed_offset_seconds BIGINT,
    ADD COLUMN IF NOT EXISTS max_observed_offset_seconds BIGINT,
    ADD COLUMN IF NOT EXISTS last_promoted_at TEXT;

UPDATE broker_timezone_candidates
   SET min_observed_offset_seconds = observed_offset_seconds,
       max_observed_offset_seconds = observed_offset_seconds
 WHERE min_observed_offset_seconds IS NULL;
