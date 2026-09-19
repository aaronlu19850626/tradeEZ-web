from __future__ import annotations

from app.db import DBConnection, DBRow



def owned_run(db: DBConnection, user_id: int, run_id: int) -> DBRow | None:
    return db.execute(
        "SELECT r.* FROM sync_runs r JOIN accounts a ON a.id=r.account_id WHERE r.id=? AND a.user_id=?",
        (run_id, user_id),
    ).fetchone()


def run_batches(db: DBConnection, run_id: int, page: int, page_size: int) -> tuple[list[DBRow], int]:
    total = int(db.execute("SELECT COUNT(*) FROM sync_batches WHERE sync_run_id=?", (run_id,)).fetchone()[0])
    rows = db.execute(
        """SELECT id, batch_id, batch_index, batch_count, item_count, inserted_count,
                  updated_count, duplicated_count, rejected_count, status, retries, received_at
           FROM sync_batches WHERE sync_run_id=? ORDER BY batch_index, id LIMIT ? OFFSET ?""",
        (run_id, page_size, (page - 1) * page_size),
    ).fetchall()
    return rows, total


def sync_runs(
    db: DBConnection, user_id: int, account_id: int | None,
    run_status: str | None, page: int, page_size: int,
) -> tuple[list[DBRow], int]:
    where = ["a.user_id = ?"]
    params: list[object] = [user_id]
    if account_id is not None:
        where.append("r.account_id = ?")
        params.append(account_id)
    if run_status:
        where.append("r.status = ?")
        params.append(run_status)
    total_row = db.execute(
        f"SELECT COUNT(*) AS count FROM sync_runs r JOIN accounts a ON a.id=r.account_id WHERE {' AND '.join(where)}",
        params,
    ).fetchone()
    total = int(total_row["count"])
    query_params = [*params, page_size, (page - 1) * page_size]
    rows = db.execute(
        f"""
        SELECT r.* FROM sync_runs r
        JOIN accounts a ON a.id=r.account_id
        WHERE {' AND '.join(where)}
        ORDER BY r.started_at DESC, r.id DESC
        LIMIT ? OFFSET ?
        """,
        query_params,
    ).fetchall()
    return rows, total


def api_logs(
    db: DBConnection, user_id: int, limit: int,
    mt5_login: int | None, success: bool | None,
) -> list[DBRow]:
    where = [
        "(l.user_id = ? OR l.account_id IN (SELECT id FROM accounts WHERE user_id = ?) OR l.mt5_login IN (SELECT mt5_login FROM accounts WHERE user_id = ?))"
    ]
    params: list[object] = [user_id, user_id, user_id]
    if mt5_login is not None:
        where.append("l.mt5_login = ?")
        params.append(mt5_login)
    if success is not None:
        where.append("l.success = ?")
        params.append(1 if success else 0)
    params.append(limit)

    rows = db.execute(
        f"""
        SELECT l.*
        FROM api_logs l
        WHERE {' AND '.join(where)}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ?
        """,
        params,
    ).fetchall()

    return rows
