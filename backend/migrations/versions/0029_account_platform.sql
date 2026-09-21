ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'mt5';

UPDATE accounts
   SET platform = 'mt5'
 WHERE platform IS NULL OR TRIM(platform) = '';
