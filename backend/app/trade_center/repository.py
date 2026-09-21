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
    """Load the user's closed trades, one row per MT5 position.

    A position can be closed in several OUT deals (partial closes). They are
    summed into a single trade so the trade count matches MT5 and the reference
    product instead of counting each partial close separately.

    Direction and entry price come from the opening deals: MT5 records the
    closing deal on the opposite side, so using the OUT deal direction would
    mirror every trade and flip the sign of the point distance.
    """
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
            min(d.ticket) AS ticket,
            d.account_login,
            d.position_id,
            max(d.symbol) AS symbol,
            COALESCE(in_.type, max(d.type)) AS type,
            sum(d.volume) AS volume,
            round((sum(d.volume * d.price) / NULLIF(sum(d.volume), 0))::numeric, 6) AS close_price,
            max(d.sl_price) AS sl_price,
            max(d.tp_price) AS tp_price,
            sum(d.profit) AS profit,
            sum(d.swap) AS swap,
            sum(d.commission) AS commission,
            max(d.magic) AS magic,
            max(d.comment) AS comment,
            min(d.open_time) AS open_time,
            max(d.deal_time) AS deal_time,
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
              SELECT min(i.type) AS type,
                     round((sum(i.volume * i.price) / NULLIF(sum(i.volume), 0))::numeric, 6) AS price
                FROM deals i
               WHERE i.account_login = d.account_login
                 AND i.position_id = d.position_id
                 AND i.entry = 0
          ) in_ ON TRUE
         WHERE {where}
         GROUP BY
            d.account_login,
            d.position_id,
            in_.type,
            in_.price,
            s.point,
            s.contract_size,
            a.id,
            a.label,
            a.account_currency
         ORDER BY max(d.deal_time) DESC, min(d.ticket) DESC
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

    base = f"""
        SELECT
            min(d.ticket) AS ticket,
            d.account_login,
            d.position_id,
            max(d.symbol) AS symbol,
            COALESCE(in_.type, max(d.type)) AS type,
            sum(d.volume) AS volume,
            round((sum(d.volume * d.price) / NULLIF(sum(d.volume), 0))::numeric, 6) AS close_price,
            max(d.sl_price) AS sl_price,
            max(d.tp_price) AS tp_price,
            sum(d.profit) AS profit,
            sum(d.swap) AS swap,
            sum(d.commission) AS commission,
            max(d.magic) AS magic,
            max(d.comment) AS comment,
            min(d.open_time) AS open_time,
            max(d.deal_time) AS deal_time,
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
              SELECT min(i.type) AS type,
                     round((sum(i.volume * i.price) / NULLIF(sum(i.volume), 0))::numeric, 6) AS price
                FROM deals i
               WHERE i.account_login = d.account_login
                 AND i.position_id = d.position_id
                 AND i.entry = 0
          ) in_ ON TRUE
         WHERE {where}
         GROUP BY
            d.account_login,
            d.position_id,
            in_.type,
            in_.price,
            s.point,
            s.contract_size,
            a.id,
            a.label,
            a.account_currency
    """
    post_where: list[str] = []
    if side != "all":
        post_where.append("type = %s")
        params.append(0 if side == "buy" else 1)
    if currency:
        post_where.append("currency = %s")
        params.append(currency)
    if symbol:
        post_where.append("symbol = %s")
        params.append(symbol)
    if result != "all":
        if result == "win":
            post_where.append("(profit + swap + commission) > 0")
        elif result == "loss":
            post_where.append("(profit + swap + commission) < 0")
        else:
            post_where.append("(profit + swap + commission) = 0")
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
         ORDER BY {sort_column} {direction}, ticket DESC
         LIMIT %s OFFSET %s
        """,
        tuple(outer_params),
    ).fetchall()
    total = int(rows[0]["total_count"]) if rows else 0
    return rows, total


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
    clauses = ["d.entry = 1", "a.user_id = %s"]
    params: list = [user_id]
    if logins is not None:
        placeholders = ",".join(["%s"] * len(logins))
        clauses.append(f"d.account_login IN ({placeholders})")
        params.extend(logins)
    where = " AND ".join(clauses)
    return db.execute(
        f"""
        SELECT MIN(d.deal_time) AS earliest_epoch,
               MAX(d.deal_time) AS latest_epoch
          FROM deals d
          JOIN accounts a ON a.mt5_login = d.account_login
         WHERE {where}
        """,
        tuple(params),
    ).fetchone()
