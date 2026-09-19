"""Materialized trade lifecycles and transactional source invalidation."""
from alembic import op

revision = "0002_trade_lifecycles"
down_revision = "0001_sync_baseline"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE trade_lifecycles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        position_id INTEGER NOT NULL,
        anchor_ticket INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('complete','partial','needs_review')),
        open_time INTEGER,
        close_time INTEGER,
        payload_json TEXT NOT NULL,
        builder_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE(account_id,position_id,anchor_ticket)
    )""")
    op.execute("CREATE INDEX idx_trades_account_open ON trade_lifecycles(account_id,open_time,id)")
    op.execute("CREATE INDEX idx_trades_account_close ON trade_lifecycles(account_id,close_time,id)")
    op.execute("CREATE INDEX idx_trades_account_status ON trade_lifecycles(account_id,status,id)")
    op.execute("""CREATE TABLE trade_allocations (
        trade_id INTEGER NOT NULL REFERENCES trade_lifecycles(id) ON DELETE CASCADE,
        deal_ticket INTEGER NOT NULL,
        role TEXT NOT NULL,
        volume REAL NOT NULL,
        profit REAL NOT NULL,
        swap REAL NOT NULL,
        commission REAL NOT NULL,
        method TEXT NOT NULL,
        PRIMARY KEY(trade_id,deal_ticket,role)
    )""")
    op.execute("""CREATE TABLE trade_dirty_positions (
        account_login INTEGER NOT NULL, position_id INTEGER NOT NULL,
        PRIMARY KEY(account_login,position_id)
    )""")
    for operation, aliases in (("INSERT", ("NEW",)), ("UPDATE", ("OLD", "NEW")), ("DELETE", ("OLD",))):
        body = " ".join(
            f"INSERT OR IGNORE INTO trade_dirty_positions(account_login,position_id) "
            f"SELECT {alias}.account_login,{alias}.position_id WHERE COALESCE({alias}.position_id,0) <> 0;"
            for alias in aliases
        )
        op.execute(f"CREATE TRIGGER trades_dirty_{operation.lower()} AFTER {operation} ON deals BEGIN {body} END")
    op.execute("""INSERT OR IGNORE INTO trade_dirty_positions
                  SELECT DISTINCT account_login,position_id FROM deals WHERE COALESCE(position_id,0) <> 0""")


def downgrade():
    raise RuntimeError("Trade lifecycle downgrade is not supported; restore a pre-migration backup.")
