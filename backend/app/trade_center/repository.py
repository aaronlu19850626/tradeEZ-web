from __future__ import annotations

from typing import Any

from app.db import DBConnection


def _refresh_closed_trades(db: DBConnection) -> None:
    db.execute("SELECT refresh_closed_trades()")


def _summary_filter_clauses(
    *,
    user_id: int,
    logins: list[int] | None,
    from_epoch: int | None,
    to_epoch: int | None,
    side: str,
    result: str,
    currency: str | None,
    market_profile: str | None,
    symbol: str | None,
) -> tuple[list[str], list[Any]]:
    clauses = ["a.user_id = %s"]
    params: list[Any] = [user_id]
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
    if side != "all":
        clauses.append("t.type = %s")
        params.append(0 if side == "buy" else 1)
    if result != "all":
        expression = "(t.profit + t.swap + t.commission)"
        clauses.append(
            f"{expression} > 0"
            if result == "win"
            else f"{expression} < 0"
            if result == "loss"
            else f"{expression} = 0"
        )
    if currency:
        clauses.append("a.account_currency = %s")
        params.append(currency)
    if market_profile:
        clauses.append("a.market_profile = %s")
        params.append(market_profile)
    if symbol:
        symbols = [part.strip() for part in symbol.split(",") if part.strip()]
        if symbols:
            placeholders = ",".join(["%s"] * len(symbols))
            clauses.append(f"t.symbol IN ({placeholders})")
            params.extend(symbols)
    return clauses, params


def _filtered_trade_cte(
    *,
    user_id: int,
    logins: list[int] | None,
    from_epoch: int | None,
    to_epoch: int | None,
    side: str,
    result: str,
    currency: str | None,
    market_profile: str | None,
    symbol: str | None,
) -> tuple[str, list[Any]]:
    clauses, params = _summary_filter_clauses(
        user_id=user_id,
        logins=logins,
        from_epoch=from_epoch,
        to_epoch=to_epoch,
        side=side,
        result=result,
        currency=currency,
        market_profile=market_profile,
        symbol=symbol,
    )
    where = " AND ".join(clauses)
    return (
        f"""
        filtered AS (
            SELECT
                t.ticket,
                t.account_login,
                t.deal_time,
                t.open_time,
                t.symbol,
                t.type,
                ROUND((t.profit + t.swap)::numeric, 2)::double precision AS gross,
                ROUND((t.profit + t.swap + t.commission)::numeric, 2)::double precision AS net,
                t.commission,
                t.swap,
                t.volume,
                CASE
                    WHEN t.open_price IS NOT NULL
                     AND COALESCE(t.sl_price, 0) > 0
                     AND COALESCE(t.contract_size, 0) > 0
                     AND t.volume > 0
                    THEN ROUND(
                        (
                            ROUND((t.profit + t.swap + t.commission)::numeric, 2)
                            / NULLIF(
                                ABS(t.open_price - t.sl_price) * t.contract_size * t.volume,
                                0
                            )
                        )::numeric,
                        4
                    )::double precision
                    ELSE NULL
                END AS r_multiple
              FROM closed_trades t
              JOIN accounts a ON a.id = t.account_id
             WHERE {where}
        )
        """,
        params,
    )


def fetch_trade_summary_sql(
    db: DBConnection,
    *,
    user_id: int,
    logins: list[int] | None,
    from_epoch: int | None,
    to_epoch: int | None,
    side: str,
    result: str,
    currency: str | None,
    market_profile: str | None,
    symbol: str | None,
) -> tuple[dict, list[dict]]:
    _refresh_closed_trades(db)
    filtered_cte, params = _filtered_trade_cte(
        user_id=user_id,
        logins=logins,
        from_epoch=from_epoch,
        to_epoch=to_epoch,
        side=side,
        result=result,
        currency=currency,
        market_profile=market_profile,
        symbol=symbol,
    )
    cumulative_cte = f"""
        cumulative AS (
            SELECT
                ticket,
                deal_time,
                gross,
                net,
                commission,
                swap,
                volume,
                r_multiple,
                ROW_NUMBER() OVER (ORDER BY deal_time, ticket) AS row_index,
                COUNT(*) OVER () AS total_count,
                SUM(net) OVER (ORDER BY deal_time, ticket ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
              FROM filtered
        )
    """
    aggregate = db.execute(
        f"""
        WITH {filtered_cte},
        {cumulative_cte}
        SELECT
            COUNT(*) AS count,
            COALESCE(ROUND(SUM(net)::numeric, 2), 0) AS net,
            COALESCE(ROUND(SUM(gross)::numeric, 2), 0) AS gross,
            COALESCE(ROUND(SUM(commission)::numeric, 2), 0) AS commission,
            COALESCE(ROUND(SUM(swap)::numeric, 2), 0) AS swap,
            COUNT(*) FILTER (WHERE net > 0) AS winners,
            COUNT(*) FILTER (WHERE net < 0) AS losers,
            COUNT(*) FILTER (WHERE net = 0) AS breakeven,
            COALESCE(ROUND(SUM(volume)::numeric, 2), 0) AS volume,
            COALESCE(ROUND((SUM(net) FILTER (WHERE net > 0))::numeric, 2), 0) AS win_sum,
            COALESCE(ROUND(ABS((SUM(net) FILTER (WHERE net < 0))::numeric), 2), 0) AS loss_sum,
            ROUND(AVG(r_multiple)::numeric, 2) AS avg_r,
            COALESCE(ROUND(MAX(running)::numeric, 2), 0) AS net_peak,
            COALESCE(ROUND(MIN(running)::numeric, 2), 0) AS net_trough
          FROM cumulative
        """,
        tuple(params),
    ).fetchone()
    series = db.execute(
        f"""
        WITH {filtered_cte},
        {cumulative_cte}
        SELECT row_index AS index, ROUND(running::numeric, 2) AS value
          FROM cumulative
         WHERE row_index = 1
            OR row_index = total_count
            OR row_index % GREATEST(1, CEIL(total_count::numeric / 1000)::bigint) = 0
         ORDER BY row_index
        """,
        tuple(params),
    ).fetchall()
    return dict(aggregate or {}), [dict(row) for row in series]


def fetch_trade_overview_sql(
    db: DBConnection,
    *,
    user_id: int,
    logins: list[int] | None,
    from_epoch: int | None,
    to_epoch: int | None,
    side: str,
    result: str,
    currency: str | None,
    market_profile: str | None,
    symbol: str | None,
) -> tuple[dict, list[dict], list[dict]]:
    _refresh_closed_trades(db)
    filtered_cte, params = _filtered_trade_cte(
        user_id=user_id,
        logins=logins,
        from_epoch=from_epoch,
        to_epoch=to_epoch,
        side=side,
        result=result,
        currency=currency,
        market_profile=market_profile,
        symbol=symbol,
    )
    aggregate = db.execute(
        f"""
        WITH {filtered_cte},
        net_running AS (
            SELECT
                net,
                ROW_NUMBER() OVER (ORDER BY deal_time, ticket) AS row_index,
                SUM(net) OVER (
                    ORDER BY deal_time, ticket
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS running
              FROM filtered
        ),
        net_drawdown AS (
            SELECT COALESCE(MAX(peak - running), 0) AS money_drawdown
              FROM (
                    SELECT
                        running,
                        MAX(running) OVER (
                            ORDER BY row_index
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                        ) AS peak
                      FROM net_running
              ) running_with_peak
        ),
        r_running AS (
            SELECT
                r_multiple,
                ROW_NUMBER() OVER (ORDER BY deal_time, ticket) AS row_index,
                SUM(r_multiple) OVER (
                    ORDER BY deal_time, ticket
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS running
              FROM filtered
             WHERE r_multiple IS NOT NULL
        ),
        r_drawdown AS (
            SELECT COALESCE(MAX(peak - running), 0) AS drawdown_r
              FROM (
                    SELECT
                        running,
                        MAX(running) OVER (
                            ORDER BY row_index
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                        ) AS peak
                      FROM r_running
              ) running_with_peak
        )
        SELECT
            COUNT(*) AS count,
            COALESCE(ROUND(SUM(net)::numeric, 2), 0) AS net,
            COALESCE(ROUND(SUM(gross)::numeric, 2), 0) AS gross,
            COALESCE(ROUND(SUM(commission)::numeric, 2), 0) AS commission,
            COALESCE(ROUND(SUM(swap)::numeric, 2), 0) AS swap,
            COUNT(*) FILTER (WHERE net > 0) AS winners,
            COUNT(*) FILTER (WHERE net < 0) AS losers,
            COUNT(*) FILTER (WHERE net = 0) AS breakeven,
            COALESCE(ROUND(SUM(volume)::numeric, 2), 0) AS volume,
            COALESCE(ROUND((SUM(net) FILTER (WHERE net > 0))::numeric, 2), 0) AS win_sum,
            COALESCE(ROUND(ABS((SUM(net) FILTER (WHERE net < 0))::numeric), 2), 0) AS loss_sum,
            COUNT(r_multiple) AS valid_r,
            AVG(r_multiple) AS expectancy,
            AVG(r_multiple) FILTER (WHERE r_multiple > 0) AS avg_win_r,
            AVG(r_multiple) FILTER (WHERE r_multiple < 0) AS avg_loss_r,
            MIN(r_multiple) AS worst_r,
            (SELECT money_drawdown FROM net_drawdown) AS money_drawdown,
            (SELECT drawdown_r FROM r_drawdown) AS drawdown_r
          FROM filtered
        """,
        tuple(params),
    ).fetchone()
    days = db.execute(
        f"""
        WITH {filtered_cte}
        SELECT
            TO_CHAR(
                (to_timestamp(deal_time) AT TIME ZONE 'UTC') + interval '8 hours',
                'YYYY-MM-DD'
            ) AS day,
            ROUND(SUM(net)::numeric, 2) AS net,
            COUNT(*) AS count,
            COUNT(*) FILTER (WHERE net > 0) AS wins
          FROM filtered
         GROUP BY day
         ORDER BY day DESC
        """,
        tuple(params),
    ).fetchall()
    recent = db.execute(
        f"""
        WITH {filtered_cte}
        SELECT
            account_login,
            ticket,
            deal_time,
            symbol,
            type,
            ROUND(net::numeric, 2) AS net
          FROM filtered
         ORDER BY deal_time DESC, ticket DESC
         LIMIT 8
        """,
        tuple(params),
    ).fetchall()
    return (
        dict(aggregate or {}),
        [dict(row) for row in days],
        [dict(row) for row in recent],
    )


def fetch_trade_overview_scatter_sql(
    db: DBConnection,
    *,
    user_id: int,
    logins: list[int] | None,
    from_epoch: int | None,
    to_epoch: int | None,
    side: str,
    result: str,
    currency: str | None,
    market_profile: str | None,
    symbol: str | None,
    bucket_count: int,
) -> list[dict]:
    _refresh_closed_trades(db)
    filtered_cte, params = _filtered_trade_cte(
        user_id=user_id,
        logins=logins,
        from_epoch=from_epoch,
        to_epoch=to_epoch,
        side=side,
        result=result,
        currency=currency,
        market_profile=market_profile,
        symbol=symbol,
    )
    rows = db.execute(
        f"""
        WITH {filtered_cte},
        raw_points AS (
            SELECT
                'timeEntry'::text AS kind,
                ((open_time + 28800) % 86400) / 3600.0 AS x,
                net AS y
              FROM filtered
            UNION ALL
            SELECT
                'timeExit'::text AS kind,
                ((deal_time + 28800) % 86400) / 3600.0 AS x,
                net AS y
              FROM filtered
            UNION ALL
            SELECT
                'duration'::text AS kind,
                GREATEST(0.1, (deal_time - open_time)::double precision) AS x,
                net AS y
              FROM filtered
        ),
        params AS (
            SELECT %s::integer AS bucket_count
        ),
        counts AS (
            SELECT COUNT(*)::integer AS total_count
              FROM filtered
        ),
        ranges AS (
            SELECT
                MIN(
                    CASE
                        WHEN kind = 'duration' THEN LN(GREATEST(x, 0.1))
                        ELSE NULL
                    END
                ) AS duration_log_min,
                MAX(
                    CASE
                        WHEN kind = 'duration' THEN LN(GREATEST(x, 0.1))
                        ELSE NULL
                    END
                ) AS duration_log_max,
                MAX(params.bucket_count) AS bucket_count
              FROM raw_points
             CROSS JOIN params
             GROUP BY params.bucket_count
        ),
        bucketed AS (
            SELECT
                points.kind,
                LEAST(
                    ranges.bucket_count - 1,
                    GREATEST(
                        0,
                        FLOOR(
                            CASE
                                WHEN points.kind = 'duration'
                                THEN (
                                    LN(GREATEST(points.x, 0.1)) - ranges.duration_log_min
                                ) / COALESCE(
                                    NULLIF(
                                        ranges.duration_log_max - ranges.duration_log_min,
                                        0
                                    ),
                                    1
                                ) * ranges.bucket_count
                                ELSE points.x / 24.0 * ranges.bucket_count
                            END
                        )::integer
                    )
                ) AS bucket,
                MIN(points.y) AS min_y,
                MAX(points.y) AS max_y
              FROM raw_points points
             CROSS JOIN ranges
             GROUP BY points.kind, bucket, ranges.bucket_count
        ),
        expanded AS (
            SELECT kind, bucket, min_y AS y
              FROM bucketed
            UNION ALL
            SELECT kind, bucket, max_y AS y
              FROM bucketed
             WHERE max_y > min_y
        ),
        selected AS (
            SELECT raw_points.kind, raw_points.x, raw_points.y
              FROM raw_points
             CROSS JOIN params
             CROSS JOIN counts
             WHERE counts.total_count <= params.bucket_count
            UNION ALL
            SELECT
                expanded.kind,
                (
                    CASE
                        WHEN expanded.kind = 'duration'
                        THEN EXP(
                            (
                                (expanded.bucket + 0.5)::double precision
                                / ranges.bucket_count
                            ) * (
                                ranges.duration_log_max - ranges.duration_log_min
                            ) + ranges.duration_log_min
                        )
                        ELSE (
                            (expanded.bucket + 0.5)::double precision
                            / ranges.bucket_count
                        ) * 24.0
                    END
                ) AS x,
                expanded.y
              FROM expanded
             CROSS JOIN ranges
             CROSS JOIN params
             CROSS JOIN counts
             WHERE counts.total_count > params.bucket_count
        )
        SELECT
            selected.kind,
            ROUND(selected.x::numeric, 6)::double precision AS x,
            ROUND(selected.y::numeric, 2)::double precision AS y
          FROM selected
         ORDER BY kind, x, y
        """,
        tuple(params) + (bucket_count,),
    ).fetchall()
    return [dict(row) for row in rows]


def fetch_group_keys_sql(
    db: DBConnection,
    *,
    user_id: int,
    logins: list[int] | None,
    from_epoch: int | None,
    to_epoch: int | None,
    side: str,
    result: str,
    currency: str | None,
    market_profile: str | None,
    symbol: str | None,
    view: str,
) -> list[str]:
    _refresh_closed_trades(db)
    clauses, params = _summary_filter_clauses(
        user_id=user_id,
        logins=logins,
        from_epoch=from_epoch,
        to_epoch=to_epoch,
        side=side,
        result=result,
        currency=currency,
        market_profile=market_profile,
        symbol=symbol,
    )
    where = " AND ".join(clauses)
    shanghai_day = "((to_timestamp(t.deal_time) AT TIME ZONE 'UTC') + interval '8 hours')::date"
    group_expression = (
        f"TO_CHAR({shanghai_day}, 'YYYY-MM-DD')"
        if view == "day"
        else f"TO_CHAR(DATE_TRUNC('week', {shanghai_day}), 'YYYY-MM-DD')"
    )
    rows = db.execute(
        f"""
        SELECT DISTINCT {group_expression} AS group_key
          FROM closed_trades t
          JOIN accounts a ON a.id = t.account_id
         WHERE {where}
         ORDER BY group_key DESC
        """,
        tuple(params),
    ).fetchall()
    return [str(row["group_key"]) for row in rows if row["group_key"]]


def list_owned_accounts(db: DBConnection, user_id: int) -> list[dict]:
    return db.execute(
        """
        SELECT id, mt5_login, label, account_currency, market_profile, is_statistics
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
            a.account_currency AS currency,
            a.market_profile AS market_profile
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
    market_profile: str | None,
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
            a.account_currency AS currency,
            a.market_profile AS market_profile
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
    if market_profile:
        post_where.append("market_profile = %s")
        params.append(market_profile)
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


def distinct_symbols(
    db: DBConnection,
    user_id: int,
    logins: list[int] | None = None,
    currency: str | None = None,
    market_profile: str | None = None,
) -> list[str]:
    _refresh_closed_trades(db)
    clauses = ["a.user_id = %s", "t.symbol IS NOT NULL"]
    params: list = [user_id]
    if logins is not None:
        placeholders = ",".join(["%s"] * len(logins))
        clauses.append(f"t.account_login IN ({placeholders})")
        params.extend(logins)
    if currency:
        clauses.append("a.account_currency = %s")
        params.append(currency)
    if market_profile:
        clauses.append("a.market_profile = %s")
        params.append(market_profile)
    where = " AND ".join(clauses)
    rows = db.execute(
        f"""
        SELECT DISTINCT t.symbol
          FROM closed_trades t
          JOIN accounts a ON a.id = t.account_id
         WHERE {where}
         ORDER BY t.symbol
        """,
        tuple(params),
    ).fetchall()
    return [str(row["symbol"]) for row in rows if row["symbol"]]


def distinct_symbol_options(
    db: DBConnection,
    user_id: int,
    logins: list[int] | None = None,
    currency: str | None = None,
    market_profile: str | None = None,
) -> list[dict]:
    _refresh_closed_trades(db)
    clauses = ["a.user_id = %s", "t.symbol IS NOT NULL"]
    params: list = [user_id]
    if logins is not None:
        placeholders = ",".join(["%s"] * len(logins))
        clauses.append(f"t.account_login IN ({placeholders})")
        params.extend(logins)
    if currency:
        clauses.append("a.account_currency = %s")
        params.append(currency)
    if market_profile:
        clauses.append("a.market_profile = %s")
        params.append(market_profile)
    where = " AND ".join(clauses)
    return db.execute(
        f"""
        SELECT DISTINCT
               t.account_id,
               COALESCE(NULLIF(TRIM(a.label), ''), a.mt5_login::text) AS account_name,
               t.symbol
          FROM closed_trades t
          JOIN accounts a ON a.id = t.account_id
         WHERE {where}
         ORDER BY account_name, t.symbol
        """,
        tuple(params),
    ).fetchall()


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


def fetch_closed_trade_bounds(
    db: DBConnection,
    user_id: int,
    logins: list[int] | None,
    market_profile: str | None = None,
) -> dict | None:
    _refresh_closed_trades(db)
    clauses = ["a.user_id = %s"]
    params: list = [user_id]
    if logins is not None:
        placeholders = ",".join(["%s"] * len(logins))
        clauses.append(f"t.account_login IN ({placeholders})")
        params.extend(logins)
    if market_profile:
        clauses.append("a.market_profile = %s")
        params.append(market_profile)
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
    market_profile: str | None,
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
    if market_profile:
        clauses.append("a.market_profile = %s")
        params.append(market_profile)
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
