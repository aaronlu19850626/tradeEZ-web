from __future__ import annotations

from app.db import DBConnection, DBRow

import json
from fastapi import HTTPException
from ..schemas import SyncRunDetailOut, SyncBatchOut
from ..schemas import SyncRunPageOut, SyncRunOut, ApiLogOut
from . import query_repository as repository


def run_detail(run_id: int, page: int, page_size: int, db: DBConnection, user: DBRow) -> SyncRunDetailOut:
    run = repository.owned_run(db, int(user["id"]), run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Synchronization run not found")
    rows, total = repository.run_batches(db, run_id, page, page_size)
    return SyncRunDetailOut(
        run=SyncRunOut.model_validate(dict(run)),
        batches=[SyncBatchOut.model_validate(dict(row)) for row in rows],
        total=total, page=page, page_size=page_size,
    )


def my_sync_runs(account_id: int | None, run_status: str | None, page: int, page_size: int, db: DBConnection, user: DBRow) -> SyncRunPageOut:
    rows, total = repository.sync_runs(db, user["id"], account_id, run_status, page, page_size)
    return SyncRunPageOut(items=[SyncRunOut.model_validate(dict(row)) for row in rows], total=total, page=page, page_size=page_size)


def my_api_logs(limit: int, mt5_login: int | None, success: bool | None, db: DBConnection, user: DBRow) -> list[ApiLogOut]:
    rows = repository.api_logs(db, user["id"], limit, mt5_login, success)
    result: list[ApiLogOut] = []
    for row in rows:
        item = dict(row)
        item["success"] = bool(item.get("success"))
        item["request_summary"] = json.loads(item.get("request_summary") or "{}")
        item["response_summary"] = json.loads(item.get("response_summary") or "{}")
        result.append(ApiLogOut.model_validate(item))
    return result
