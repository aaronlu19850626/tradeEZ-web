from __future__ import annotations

from app.db import DBConnection
from fastapi import APIRouter, Depends, Header, Request
from starlette.concurrency import run_in_threadpool
from ..db import get_db
from ..accounts.policies import ensure_account_active
from ..common.rate_limit import check_rate_limit
from .auth import RATE_LIMITS, authenticate_v2, get_bound_account
from . import service
from ..v2_models import (
    AccountRequest,
    ApiError,
    HeartbeatRequest,
    HeartbeatResponse,
    IngestDealsRequest,
    IngestDealsResponse,
    IngestSettingsRequest,
    IngestSettingsResponse,
    IngestSnapshotsRequest,
    IngestSnapshotsResponse,
    IngestSymbolsRequest,
    IngestSymbolsResponse,
    LastSyncTimeResponse,
    UpdateLastSyncTimeRequest,
    UpdateLastSyncTimeResponse,
)

router = APIRouter(prefix="/api/v1", tags=["v2.1-sync"])

@router.post("/sync/last_sync_time", response_model=LastSyncTimeResponse)
async def get_last_sync_time(
    payload: AccountRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    db: DBConnection = Depends(get_db),
) -> LastSyncTimeResponse:
    account = await authenticate_v2(request, payload.mt5_login, authorization, x_timestamp, x_signature, db)
    check_rate_limit("last_sync_time", str(account["id"]), RATE_LIMITS["last_sync_time"])
    return await run_in_threadpool(service.get_last_sync_time, payload, account, db)


@router.post("/ingest/deals", response_model=IngestDealsResponse)
async def ingest_deals_v21(
    payload: IngestDealsRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    db: DBConnection = Depends(get_db),
) -> IngestDealsResponse:
    account = await get_bound_account(
        request,
        payload,
        authorization,
        x_timestamp,
        x_signature,
        db,
        "deals_batch" if payload.sync_run_id is not None else "deals",
        rate_limit=RATE_LIMITS["deals_batch"] if payload.sync_run_id is not None else None,
    )
    ensure_account_active(account)
    return await run_in_threadpool(service.ingest_deals_v21, payload, account, db)


@router.post("/sync/update_last_sync_time", response_model=UpdateLastSyncTimeResponse)
async def update_last_sync_time(
    payload: UpdateLastSyncTimeRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    db: DBConnection = Depends(get_db),
) -> UpdateLastSyncTimeResponse:
    account = await authenticate_v2(request, payload.mt5_login, authorization, x_timestamp, x_signature, db)
    ensure_account_active(account)
    check_rate_limit("update_cursor", str(account["id"]), RATE_LIMITS["update_cursor"])

    return await run_in_threadpool(service.update_last_sync_time, payload, account, db)


@router.post("/ingest/symbols", response_model=IngestSymbolsResponse)
async def ingest_symbols_v21(
    payload: IngestSymbolsRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    db: DBConnection = Depends(get_db),
) -> IngestSymbolsResponse:
    account = await get_bound_account(request, payload, authorization, x_timestamp, x_signature, db, "symbols")
    return await run_in_threadpool(service.ingest_symbols_v21, payload, account, db)


@router.post("/ingest/snapshots", response_model=IngestSnapshotsResponse)
async def ingest_snapshots_v21(
    payload: IngestSnapshotsRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    db: DBConnection = Depends(get_db),
) -> IngestSnapshotsResponse:
    account = await get_bound_account(
        request, payload, authorization, x_timestamp, x_signature, db, "snapshots", window_seconds=3600
    )
    return await run_in_threadpool(service.ingest_snapshots_v21, payload, account, db)


@router.post("/ingest/settings", response_model=IngestSettingsResponse)
async def ingest_settings_v21(
    payload: IngestSettingsRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    db: DBConnection = Depends(get_db),
) -> IngestSettingsResponse:
    account = await get_bound_account(
        request, payload, authorization, x_timestamp, x_signature, db, "settings", window_seconds=3600
    )
    return await run_in_threadpool(service.ingest_settings_v21, payload, account, db)


@router.post("/ingest/heartbeat", response_model=HeartbeatResponse)
async def heartbeat_v21(
    payload: HeartbeatRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    db: DBConnection = Depends(get_db),
) -> HeartbeatResponse:
    account = await authenticate_v2(request, payload.mt5_login, authorization, x_timestamp, x_signature, db)
    check_rate_limit("heartbeat", str(account["id"]), RATE_LIMITS["heartbeat"], 3600)
    return await run_in_threadpool(service.heartbeat_v21, payload, account, db)


