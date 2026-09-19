from __future__ import annotations

from app.db import DBConnection, DBRow

from fastapi import APIRouter, Depends, Query
from ..db import get_db
from ..security import get_current_user
from ..schemas import SyncRunPageOut, ApiLogOut
from . import queries as service
from ..schemas import SyncRunDetailOut

router = APIRouter(tags=["sync-queries"])


@router.get("/api/v1/my/sync-runs/{run_id}", response_model=SyncRunDetailOut)
def run_detail(
    run_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> SyncRunDetailOut:
    return service.run_detail(run_id, page, page_size, db, user)

@router.get("/api/v1/my/sync-runs", response_model=SyncRunPageOut)
def my_sync_runs(
    account_id: int | None = Query(default=None),
    run_status: str | None = Query(default=None, alias="status", max_length=20),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> SyncRunPageOut:
    return service.my_sync_runs(account_id, run_status, page, page_size, db, user)


@router.get("/api/v1/my/api-logs", response_model=list[ApiLogOut])
def my_api_logs(
    limit: int = Query(100, ge=1, le=500),
    mt5_login: int | None = Query(default=None),
    success: bool | None = Query(default=None),
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> list[ApiLogOut]:
    return service.my_api_logs(limit, mt5_login, success, db, user)
