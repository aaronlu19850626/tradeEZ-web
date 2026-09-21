ALTER TABLE broker_timezone_candidates
    ADD COLUMN IF NOT EXISTS broker_key TEXT;

UPDATE broker_timezone_candidates
   SET broker_key = LOWER(platform) || '|' ||
                    LOWER(COALESCE(broker_server, '')) || '|' ||
                    LOWER(COALESCE(broker_company, ''))
 WHERE broker_key IS NULL;

ALTER TABLE broker_timezone_candidates
    ALTER COLUMN broker_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_broker_timezone_candidates_broker_key
    ON broker_timezone_candidates(broker_key);
