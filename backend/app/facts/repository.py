from __future__ import annotations

import sqlite3


def deal_by_ticket(db: sqlite3.Connection, account_login: int, ticket: int) -> sqlite3.Row | None:
    return db.execute(
        "SELECT * FROM deals WHERE account_login=? AND ticket=?", (account_login, ticket)
    ).fetchone()


def source_batches(
    db: sqlite3.Connection, account_id: int, account_login: int,
    ticket: int, page: int, page_size: int,
) -> tuple[list[sqlite3.Row], int]:
    where = "b.account_id=? AND r.account_login=? AND r.deal_ticket=?"
    params = (account_id, account_login, ticket)
    total = db.execute(
        f"SELECT COUNT(*) FROM sync_batch_refs r JOIN sync_batches b ON b.id=r.sync_batch_id WHERE {where}", params
    ).fetchone()[0]
    rows = db.execute(
        f"""SELECT b.sync_run_id, b.batch_id, b.batch_index, b.status, b.received_at
            FROM sync_batch_refs r JOIN sync_batches b ON b.id=r.sync_batch_id
            WHERE {where} ORDER BY b.received_at DESC, b.id DESC LIMIT ? OFFSET ?""",
        (*params, page_size, (page - 1) * page_size),
    ).fetchall()
    return rows, int(total)


def raw_deals(
    db: sqlite3.Connection,
    user_id: int,
    account_login: int | None,
    ticket: int | None,
    position_id: int | None,
    order_id: int | None,
    symbol: str | None,
    entry: int | None,
    start_time: int | None,
    end_time: int | None,
    page: int,
    page_size: int,
    sort: str,
) -> tuple[list[sqlite3.Row], int]:
    where = ["d.account_login IN (SELECT mt5_login FROM accounts WHERE user_id = ?)"]
    params: list[object] = [user_id]
    if account_login is not None:
        where.append("d.account_login = ?")
        params.append(account_login)
    if ticket is not None:
        where.append("d.ticket = ?")
        params.append(ticket)
    if position_id is not None:
        where.append("d.position_id = ?")
        params.append(position_id)
    if order_id is not None:
        where.append("d.order_id = ?")
        params.append(order_id)
    if symbol:
        where.append("UPPER(TRIM(d.symbol)) LIKE ?")
        params.append(f"%{symbol.strip().upper()}%")
    if entry is not None:
        where.append("d.entry = ?")
        params.append(entry)
    if start_time is not None:
        where.append("d.deal_time >= ?")
        params.append(start_time)
    if end_time is not None:
        where.append("d.deal_time <= ?")
        params.append(end_time)

    where_sql = " AND ".join(where)
    total = int(db.execute(f"SELECT COUNT(*) AS count FROM deals d WHERE {where_sql}", params).fetchone()["count"])
    sort_map = {
        "deal_time_desc": "d.deal_time DESC, d.ticket DESC",
        "deal_time_asc": "d.deal_time ASC, d.ticket ASC",
        "open_time_desc": "d.open_time DESC, d.ticket DESC",
        "open_time_asc": "d.open_time ASC, d.ticket ASC",
        "ticket_desc": "d.ticket DESC",
        "ticket_asc": "d.ticket ASC",
    }
    rows = db.execute(
        f"""
        SELECT d.* FROM deals d
        WHERE {where_sql}
        ORDER BY {sort_map[sort]}, d.account_login ASC, d.id ASC
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return rows, total


def account_deals(db: sqlite3.Connection, account_login: int, limit: int) -> list[sqlite3.Row]:
    rows = db.execute(
        "SELECT * FROM deals WHERE account_login = ? ORDER BY deal_time DESC, ticket DESC LIMIT ?",
        (account_login, limit),
    ).fetchall()

    return rows


def account_settings(db: sqlite3.Connection, account_login: int, limit: int) -> list[sqlite3.Row]:
    rows = db.execute(
        """
        SELECT id, account_login, snapshot_time, settings_json, group_count,
               key_count, received_at, content_hash
          FROM ea_settings_history
         WHERE account_login = ?
         ORDER BY snapshot_time DESC, id DESC
         LIMIT ?
        """,
        (account_login, limit),
    ).fetchall()

    return rows


def account_snapshots(
    db: sqlite3.Connection,
    account_login: int,
    start_time: int | None,
    end_time: int | None,
    limit: int,
) -> tuple[list[sqlite3.Row], int]:
    where = ["account_login = ?"]
    params: list[object] = [account_login]
    if start_time is not None:
        where.append("timestamp >= ?")
        params.append(start_time)
    if end_time is not None:
        where.append("timestamp <= ?")
        params.append(end_time)
    where_sql = " AND ".join(where)
    total = int(db.execute(
        f"SELECT COUNT(*) AS count FROM snapshots WHERE {where_sql}", params
    ).fetchone()["count"])
    # Charts read chronologically; take the newest ``limit`` points then reorder ascending.
    rows = db.execute(
        f"""
        SELECT * FROM (
            SELECT timestamp, balance, equity, margin, free_margin, margin_level
              FROM snapshots
             WHERE {where_sql}
             ORDER BY timestamp DESC, id DESC
             LIMIT ?
        ) ORDER BY timestamp ASC
        """,
        [*params, limit],
    ).fetchall()
    return rows, total


def account_symbols(
    db: sqlite3.Connection,
    account_login: int,
    q: str | None,
    page: int,
    page_size: int,
) -> tuple[list[sqlite3.Row], int]:
    where = ["account_login = ?"]
    params: list[object] = [account_login]
    if q:
        where.append("UPPER(symbol) LIKE ?")
        params.append(f"%{q.strip().upper()}%")
    where_sql = " AND ".join(where)
    total = int(db.execute(
        f"SELECT COUNT(*) AS count FROM symbols WHERE {where_sql}", params
    ).fetchone()["count"])
    rows = db.execute(
        f"""
        SELECT symbol, digits, point, tick_size, tick_value, contract_size,
               currency_base, currency_profit, updated_at
          FROM symbols
         WHERE {where_sql}
         ORDER BY symbol ASC, id ASC
         LIMIT ? OFFSET ?
        """,
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return rows, total
