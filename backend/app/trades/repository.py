from __future__ import annotations

from app.db import DBConnection, DBRow



def position_deals(db: DBConnection, account_login: int) -> list[DBRow]:
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


def owned_accounts(db: DBConnection, user_id: int) -> list[DBRow]:
    return db.execute("SELECT * FROM accounts WHERE user_id=? ORDER BY id ASC", (user_id,)).fetchall()
