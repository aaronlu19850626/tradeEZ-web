from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import FileResponse

from app.db import DBConnection, get_db

from .auth import authenticate_connector
from .schemas import CursorOut, EventBatchRequest, EventBatchResponse, HandshakeRequest, HandshakeResponse
from . import service

router = APIRouter(prefix="/api/v1", tags=["connector"])


@router.post("/connectors/handshake", response_model=HandshakeResponse)
async def handshake(
    payload: HandshakeRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    db: DBConnection = Depends(get_db),
) -> HandshakeResponse:
    account = await authenticate_connector(request, authorization, x_timestamp, x_signature, db)
    download_base_url = (
        f"{str(request.base_url).rstrip('/')}/api/v1/connectors/mt5/download/tradeezsync-v2.mq5"
    )
    return service.handshake(payload, account, db, download_base_url=download_base_url)


@router.get("/connectors/mt5/download/tradeezsync-v2.mq5", include_in_schema=False)
def download_mt5_connector() -> FileResponse:
    connector_path = (
        Path(__file__).resolve().parents[3]
        / "connectors"
        / "mt5"
        / "sync"
        / "v2"
        / "tradeEZSyncV2.mq5"
    )
    return FileResponse(
        connector_path,
        media_type="application/octet-stream",
        filename="tradeEZSyncV2.mq5",
    )


@router.get("/connections/{connection_id}/cursor", response_model=CursorOut)
async def get_cursor(
    connection_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    db: DBConnection = Depends(get_db),
) -> CursorOut:
    account = await authenticate_connector(request, authorization, x_timestamp, x_signature, db)
    return service.cursor(connection_id, account, db)


@router.post("/connections/{connection_id}/events", response_model=EventBatchResponse)
async def submit_events(
    connection_id: str,
    payload: EventBatchRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    db: DBConnection = Depends(get_db),
) -> EventBatchResponse:
    account = await authenticate_connector(request, authorization, x_timestamp, x_signature, db)
    return service.submit_events(connection_id, payload, account, db)
