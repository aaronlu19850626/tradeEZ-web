from __future__ import annotations

from app.db import DBConnection


def list_owned_accounts(db: DBConnection, user_id: int) -> list[dict]:
    return db.execute(
        """
        SELECT id, mt5_login, label, account_currency, is_statistics
          FROM accounts
         WHERE user_id = %s
         ORDER BY created_at DESC, id DESC
        """,
        (user_id,),
    ).fetchall()


def fetch_closed_trades(
    db: DBConnection,
    *,
    user_id: int,
    logins: list[int] | None,
    from_epoch: int | None,
    to_epoch: int | None,
) -> list[dict]:
    """Load the user's closed trades (MT5 DEAL_ENTRY_OUT deals) with enrichments."""
    clauses = ["d.entry = 1", "a.user_id = %s"]
    params: list = [user_id]
    if logins is not None:
        placeholders = ",".join(["%s"] * len(logins))
        clauses.append(f"d.account_login IN ({placeholders})")
        params.extend(logins)
    if from_epoch is not None:
        clauses.append("d.deal_time >= %s")
        params.append(from_epoch)
    if to_epoch is not None:
        clauses.append("d.deal_time < %s")
        params.append(to_epoch)

    where = " AND ".join(clauses)
    return db.execute(
        f"""
        SELECT
            d.ticket,
            d.account_login,
            d.position_id,
            d.symbol,
            d.type,
            d.volume,
            d.price AS close_price,
            d.sl_price,
            d.tp_price,
            d.profit,
            d.swap,
            d.commission,
            d.magic,
            d.comment,
            d.open_time,
            d.deal_time,
            in_.price AS open_price,
            s.point,
            s.contract_size,
            a.id AS account_id,
            a.label AS account_name,
            a.account_currency AS currency
          FROM deals d
          JOIN accounts a ON a.mt5_login = d.account_login
          LEFT JOIN symbols s ON s.account_login = d.account_login AND s.symbol = d.symbol
          LEFT JOIN LATERAL (
              SELECT i.price
                FROM deals i
               WHERE i.account_login = d.account_login
                 AND i.position_id = d.position_id
                 AND i.entry = 0
               ORDER BY i.deal_time ASC
               LIMIT 1
          ) in_ ON TRUE
         WHERE {where}
         ORDER BY d.deal_time DESC, d.ticket DESC
        """,
        tuple(params),
    ).fetchall()


def distinct_symbols(db: DBConnection, user_id: int) -> list[str]:
    rows = db.execute(
        """
        SELECT DISTINCT d.symbol
          FROM deals d
          JOIN accounts a ON a.mt5_login = d.account_login
         WHERE d.entry = 1 AND a.user_id = %s
         ORDER BY d.symbol
        """,
        (user_id,),
    ).fetchall()
    return [str(row["symbol"]) for row in rows if row["symbol"]]
