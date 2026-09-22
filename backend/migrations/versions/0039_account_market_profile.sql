ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS market_profile TEXT NOT NULL DEFAULT 'fx';

UPDATE accounts
   SET market_profile = CASE
       WHEN LOWER(TRIM(platform)) = 'ctp' THEN 'cn'
       ELSE 'fx'
   END;

ALTER TABLE accounts
    DROP CONSTRAINT IF EXISTS accounts_market_profile_check;

ALTER TABLE accounts
    ADD CONSTRAINT accounts_market_profile_check
    CHECK (market_profile IN ('cn', 'fx'));

CREATE INDEX IF NOT EXISTS idx_accounts_user_market_profile
    ON accounts(user_id, market_profile);
