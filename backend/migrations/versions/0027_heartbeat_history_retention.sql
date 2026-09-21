CREATE INDEX IF NOT EXISTS idx_heartbeat_history_time
    ON heartbeat_history(timestamp);
