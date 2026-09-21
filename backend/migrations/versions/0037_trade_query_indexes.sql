CREATE INDEX IF NOT EXISTS idx_deals_account_entry_time
    ON deals(account_login, entry, deal_time);

CREATE INDEX IF NOT EXISTS idx_deals_account_entry_position
    ON deals(account_login, entry, position_id);
