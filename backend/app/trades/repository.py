from __future__ import annotations

import sqlite3


def position_deals(db: sqlite3.Connection, account_login: int) -> list[sqlite3.Row]:
    rows = db.execute(
        """
        SELECT * FROM deals
        WHERE account_login = ?
          AND position_id IS NOT NULL AND position_id <> 0
          AND symbol IS NOT NULL AND TRIM(symbol) <> ''
        ORDER BY deal_time ASC, ticket ASC
        """,
        (account_login,),
    ).fetchall()

    return rows


def owned_accounts(db: sqlite3.Connection, user_id: int) -> list[sqlite3.Row]:
    return db.execute("SELECT * FROM accounts WHERE user_id=? ORDER BY id ASC", (user_id,)).fetchall()
