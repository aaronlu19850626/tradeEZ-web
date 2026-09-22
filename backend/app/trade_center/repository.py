from __future__ import annotations

from app.db import DBConnection


def _refresh_closed_trades(db: DBConnection) -> None:
    db.execute("SELECT refresh_closed_trades()")


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
    """Load the user's closed trades from the maintained projection table."""
    _refresh_closed_trades(db)
    clauses = ["a.user_id = %s"]
    params: list = [user_id]
    if logins is not None:
        placeholders = ",".join(["%s"] * len(logins))
        clauses.append(f"t.account_login IN ({placeholders})")
        params.extend(logins)
    if from_epoch is not None:
        clauses.append("t.deal_time >= %s")
        params.append(from_epoch)
    if to_epoch is not None:
        clauses.append("t.deal_time < %s")
        params.append(to_epoch)

    where = " AND ".join(clauses)
    return db.execute(
        f"""
        SELECT
            t.ticket,
            t.account_login,
            t.position_id,
            t.symbol,
            t.type,
            t.volume,
            t.close_price,
            t.sl_price,
            t.tp_price,
            t.profit,
            t.swap,
            t.commission,
            t.magic,
            t.comment,
            t.open_time,
            t.deal_time,
            t.open_price,
            t.point,
            t.contract_size,
            t.account_id,
            a.label AS account_name,
            a.account_currency AS currency
          FROM closed_trades t
          JOIN accounts a ON a.id = t.account_id
         WHERE {where}
         ORDER BY t.deal_time DESC, t.ticket DESC
        """,
        tuple(params),
    ).fetchall()


def fetch_closed_trades_page(
    db: DBConnection,
    *,
    user_id: int,
    logins: list[int] | None,
    from_epoch: int | None,
    to_epoch: int | None,
    side: str,
    result: str,
    currency: str | None,
    symbol: str | None,
    sort: str,
    order: str,
    page: int,
    page_size: int,
) -> tuple[list[dict], int]:
    _refresh_closed_trades(db)
    clauses = ["a.user_id = %s"]
    params: list = [user_id]
    if logins is not None:
        placeholders = ",".join(["%s"] * len(logins))
        clauses.append(f"t.account_login IN ({placeholders})")
        params.extend(logins)
    if from_epoch is not None:
        clauses.append("t.deal_time >= %s")
        params.append(from_epoch)
    if to_epoch is not None:
        clauses.append("t.deal_time < %s")
        params.append(to_epoch)
    where = " AND ".join(clauses)

    base = f"""
        SELECT
            t.ticket,
            t.account_login,
            t.position_id,
            t.symbol,
            t.type,
            t.volume,
            t.close_price,
            t.sl_price,
            t.tp_price,
            t.profit,
            t.swap,
            t.commission,
            t.magic,
            t.comment,
            t.open_time,
            t.deal_time,
            t.open_price,
            t.point,
            t.contract_size,
            t.account_id,
            a.label AS account_name,
            a.account_currency AS currency
          FROM closed_trades t
          JOIN accounts a ON a.id = t.account_id
         WHERE {where}
    """
    post_where: list[str] = []
    if side != "all":
        post_where.append("c.type = %s")
        params.append(0 if side == "buy" else 1)
    if currency:
        post_where.append("currency = %s")
        params.append(currency)
    if symbol:
        symbols = [part.strip() for part in symbol.split(",") if part.strip()]
        if symbols:
            placeholders = ",".join(["%s"] * len(symbols))
            post_where.append(f"symbol IN ({placeholders})")
            params.extend(symbols)
    if result != "all":
        if result == "win":
            post_where.append("(c.profit + c.swap + c.commission) > 0")
        elif result == "loss":
            post_where.append("(c.profit + c.swap + c.commission) < 0")
        else:
            post_where.append("(c.profit + c.swap + c.commission) = 0")
    post_sql = (" AND ".join(post_where)) if post_where else "1 = 1"

    sort_columns = {
        "closeTime": "deal_time",
        "openTime": "open_time",
        "symbol": "symbol",
        "side": "type",
        "volume": "volume",
        "swap": "swap",
        "commission": "commission",
        "duration": "(deal_time - open_time)",
        "accountName": "account_name",
    }
    sort_column = sort_columns.get(sort, "deal_time")
    direction = "DESC" if order == "desc" else "ASC"
    offset = (page - 1) * page_size
    outer_params = list(params) + [page_size, offset]
    rows = db.execute(
        f"""
        SELECT c.*, COUNT(*) OVER() AS total_count
          FROM ({base}) c
         WHERE {post_sql}
         ORDER BY {sort_column} {direction}, c.ticket DESC
         LIMIT %s OFFSET %s
        """,
        tuple(outer_params),
    ).fetchall()
    total = int(rows[0]["total_count"]) if rows else 0
    return rows, total


def distinct_symbols(db: DBConnection, user_id: int) -> list[str]:
    _refresh_closed_trades(db)
    rows = db.execute(
        """
        SELECT DISTINCT t.symbol
          FROM closed_trades t
          JOIN accounts a ON a.id = t.account_id
         WHERE a.user_id = %s
           AND t.symbol IS NOT NULL
         ORDER BY t.symbol
        """,
        (user_id,),
    ).fetchall()
    return [str(row["symbol"]) for row in rows if row["symbol"]]


def distinct_currencies(db: DBConnection, user_id: int) -> list[str]:
    rows = db.execute(
        """
        SELECT DISTINCT a.account_currency AS currency
          FROM accounts a
         WHERE a.user_id = %s
           AND a.account_currency IS NOT NULL
           AND TRIM(a.account_currency) <> ''
         ORDER BY a.account_currency
        """,
        (user_id,),
    ).fetchall()
    return [str(row["currency"]).upper() for row in rows if row["currency"]]


def fetch_closed_trade_bounds(db: DBConnection, user_id: int, logins: list[int] | None) -> dict | None:
    _refresh_closed_trades(db)
    clauses = ["a.user_id = %s"]
    params: list = [user_id]
    if logins is not None:
        placeholders = ",".join(["%s"] * len(logins))
        clauses.append(f"t.account_login IN ({placeholders})")
        params.extend(logins)
    where = " AND ".join(clauses)
    return db.execute(
        f"""
        SELECT MIN(t.deal_time) AS earliest_epoch,
               MAX(t.deal_time) AS latest_epoch
          FROM closed_trades t
          JOIN accounts a ON a.id = t.account_id
         WHERE {where}
        """,
        tuple(params),
    ).fetchone()


def fetch_calendar_days(
    db: DBConnection,
    *,
    user_id: int,
    logins: list[int] | None,
    from_epoch: int,
    to_epoch: int,
    range_from_epoch: int | None = None,
    range_to_epoch: int | None = None,
    side: str,
    result: str,
    currency: str | None,
    symbol: str | None,
) -> list[dict]:
    _refresh_closed_trades(db)
    clauses = ["a.user_id = %s", "t.deal_time >= %s", "t.deal_time < %s"]
    params: list = [user_id, from_epoch, to_epoch]
    if range_from_epoch is not None:
        clauses.append("t.deal_time >= %s")
        params.append(range_from_epoch)
    if range_to_epoch is not None:
        clauses.append("t.deal_time < %s")
        params.append(range_to_epoch)
    if logins is not None:
        placeholders = ",".join(["%s"] * len(logins))
        clauses.append(f"t.account_login IN ({placeholders})")
        params.extend(logins)
    if side != "all":
        clauses.append("t.type = %s")
        params.append(0 if side == "buy" else 1)
    if result != "all":
        if result == "win":
            clauses.append("(t.profit + t.swap + t.commission) > 0")
        elif result == "loss":
            clauses.append("(t.profit + t.swap + t.commission) < 0")
        else:
            clauses.append("(t.profit + t.swap + t.commission) = 0")
    if currency:
        clauses.append("a.account_currency = %s")
        params.append(currency)
    if symbol:
        symbols = [part.strip() for part in symbol.split(",") if part.strip()]
        if symbols:
            placeholders = ",".join(["%s"] * len(symbols))
            clauses.append(f"t.symbol IN ({placeholders})")
            params.extend(symbols)

    where = " AND ".join(clauses)
    return db.execute(
        f"""
        SELECT
            to_char(
                (to_timestamp(t.deal_time) AT TIME ZONE 'UTC') + interval '8 hours',
                'YYYY-MM-DD'
            ) AS day,
            round(sum(t.profit + t.swap + t.commission)::numeric, 2) AS net,
            count(*) AS count
          FROM closed_trades t
          JOIN accounts a ON a.id = t.account_id
         WHERE {where}
         GROUP BY day
         ORDER BY day
        """,
        tuple(params),
    ).fetchall()
