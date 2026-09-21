from __future__ import annotations

import hashlib
import json
import secrets

from app.db import DBConnection, DBRow
from app.v2_models import ApiError
from app.config import get_settings

from . import repository
from .normalizers import normalize_mt5_event
from .schemas import CursorOut, EventBatchRequest, EventBatchResponse, HandshakeRequest, HandshakeResponse, UpgradeInfo

CAPABILITIES = ["instruments", "trades", "orders", "positions", "snapshots", "heartbeat"]
LIMITS = {"max_batch_size": 1000, "max_events": 5000, "max_body_bytes": 4 * 1024 * 1024}
settings = get_settings()


def _version_tuple(value: str) -> tuple[int, ...]:
    parts: list[int] = []
    for item in value.split("."):
        if not item.isdigit():
            break
        parts.append(int(item))
    return tuple(parts)


def _cursor(row: DBRow) -> CursorOut:
    return CursorOut(
        basis=str(row["cursor_basis"]),
        value=int(row["cursor_value"] or 0),
        state=json.loads(str(row["cursor_state_json"] or "{}")),
    )


def handshake(payload: HandshakeRequest, account: DBRow, db: DBConnection) -> HandshakeResponse:
    connection_id = f"cn_{secrets.token_urlsafe(16).replace('-', '')}"
    row = repository.ensure_connection(
        db,
        connection_id=connection_id,
        account_id=int(account["id"]),
        platform=payload.platform,
        account_ref=payload.account_ref,
        instance_id=payload.instance_id,
        connector_version=payload.connector_version,
        capabilities=CAPABILITIES,
    )
    db.commit()
    upgrade = None
    if payload.platform == "mt5":
        current = _version_tuple(payload.connector_version or "0")
        minimum = _version_tuple(settings.connector_mt5_min_version)
        if current < minimum:
            upgrade = UpgradeInfo(
                required=True,
                required_version=settings.connector_mt5_min_version,
                download_url=settings.connector_mt5_download_url,
                message="当前连接器版本过低，请下载最新版本后重新加载。",
            )

    return HandshakeResponse(
        connection_id=str(row["connection_id"]),
        platform=str(row["platform"]),
        protocol_version=str(row["protocol_version"]),
        capabilities=json.loads(str(row["capabilities_json"] or "[]")),
        limits=LIMITS,
        cursor=_cursor(row),
        upgrade=upgrade,
    )


def cursor(connection_id: str, account: DBRow, db: DBConnection) -> CursorOut:
    row = repository.find_by_id(db, connection_id, int(account["id"]))
    if row is None:
        raise ApiError(code="CONNECTION_NOT_FOUND", message="Connector connection was not found", status_code=404)
    return _cursor(row)


def submit_events(
    connection_id: str,
    payload: EventBatchRequest,
    account: DBRow,
    db: DBConnection,
) -> EventBatchResponse:
    row = repository.find_by_id(db, connection_id, int(account["id"]))
    if row is None:
        raise ApiError(code="CONNECTION_NOT_FOUND", message="Connector connection was not found", status_code=404)

    if payload.batch_index >= payload.batch_count:
        raise ApiError(code="BATCH_INDEX_OUT_OF_RANGE", message="batch_index must be smaller than batch_count", status_code=400)

    events = [event.model_dump() for event in payload.events]
    payload_hash = hashlib.sha256(
        json.dumps(events, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    existing = repository.find_batch(db, int(row["id"]), payload.batch_id)
    if existing is not None:
        if existing["payload_hash"] != payload_hash:
            raise ApiError(
                code="BATCH_CONTENT_CONFLICT",
                message="The same batch_id was retried with different events",
                status_code=409,
            )
        return EventBatchResponse(
            accepted=len(events),
            inserted=0,
            duplicates=len(events),
            cursor=_cursor(row),
            replay=True,
        )

    db.execute("BEGIN")
    try:
        batch_row_id = repository.insert_batch(
            db,
            connection_id=int(row["id"]),
            batch_id=payload.batch_id,
            batch_index=payload.batch_index,
            batch_count=payload.batch_count,
            idempotency_key=payload.idempotency_key,
            payload_hash=payload_hash,
            item_count=len(events),
        )
        inserted = 0
        for event in events:
            if repository.insert_event(
                db,
                connection_id=int(row["id"]),
                event_id=event["event_id"],
                event_type=event["type"],
                occurred_at=event["occurred_at"],
                batch_id=payload.batch_id,
                payload=event["data"],
            ):
                inserted += 1
                if row["platform"] == "mt5":
                    normalize_mt5_event(account, event["type"], event["data"], db)
        duplicates = len(events) - inserted
        repository.refresh_batch_counts(db, batch_row_id, inserted, duplicates)

        latest_occurred_at = max((event["occurred_at"] for event in events), default=int(row["cursor_value"] or 0))
        next_state = {"last_batch_id": payload.batch_id}
        if payload.batch_index + 1 >= payload.batch_count:
            repository.update_cursor(db, int(row["id"]), latest_occurred_at, next_state)
        db.commit()
    except Exception as exc:
        db.rollback()
        if settings.environment != "production":
            raise ApiError(
                code="CONNECTOR_EVENT_FAILED",
                message=str(exc),
                status_code=500,
            ) from exc
        raise

    updated = repository.find_by_id(db, connection_id, int(account["id"]))
    return EventBatchResponse(
        accepted=len(events),
        inserted=inserted,
        duplicates=duplicates,
        cursor=_cursor(updated),
        replay=False,
    )
