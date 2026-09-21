ALTER TABLE accounts
    ALTER COLUMN account_currency SET DEFAULT 'USD';

UPDATE accounts
   SET account_currency = CASE
       WHEN platform = 'ctp' THEN 'CNY'
       WHEN account_currency IS NULL OR TRIM(account_currency) = '' THEN 'USD'
       ELSE UPPER(TRIM(account_currency))
   END;

ALTER TABLE accounts
    ALTER COLUMN account_currency SET NOT NULL;
