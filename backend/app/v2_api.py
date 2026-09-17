from __future__ import annotations

import hashlib
import hmac
import json
import sqlite3
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import APIRouter, Depends, Header, Request

from .config import get_settings
from .crypto import decrypt_sync_key
from .db import get_db
from .v2_models import (
    AccountRequest,
    ApiError,
    HeartbeatRequest,
    HeartbeatResponse,
    IngestDealsRequest,
    IngestDealsResponse,
    IngestSnapshotsRequest,
    IngestSnapshotsResponse,
    IngestSymbolsRequest,
    IngestSymbolsResponse,
    LastSyncTimeResponse,
    UpdateLastSyncTimeRequest,
    UpdateLastSyncTimeResponse,
)

router = APIRouter(prefix="/api/v1", tags=["v2.1-sync"])
settings = get_settings()

RATE_LIMITS = {
    "last_sync_time": 60,
    "deals": 30,
    "update_cursor": 60,
    "symbols": 10,
    "snapshots": 120,
    "heartbeat": 12,
}
_rate_buckets: dict[str, deque[float]] = defaultdict(deque)
_rate_lock = Lock()


def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def check_rate_limit(scope: str, identity: str, limit: int, window_seconds: int = 60) -> None:
    key = f"{scope}:{identity}"
    now = time.time()
    with _rate_lock:
        bucket = _rate_buckets[key]
        while bucket and now - bucket[0] >= window_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = max(1, int(window_seconds - (now - bucket[0])))
            raise ApiError(
                code="RATE_LIMIT_EXCEEDED",
                message="Request rate limit exceeded",
                status_code=429,
                details={"retry_after_seconds": retry_after},
            )
        bucket.append(now)


def _verify_hmac(account: sqlite3.Row, token: str, raw_body: bytes, x_timestamp: str | None, x_signature: str | None) -> None:
    encrypted_key = account["key_encrypted"] if "key_encrypted" in account.keys() else None
    recovered = decrypt_sync_key(encrypted_key, settings)

    # Keys generated before HMAC support only have an irreversible hash. They remain
    # Bearer-compatible until rotation; all newly created keys require HMAC.
    if not recovered:
        if encrypted_key:
            raise ApiError(
                code="INTERNAL_ERROR",
                message="Sync key could not be decrypted; check TRADESYNC_SYNC_KEY_ENCRYPTION_SECRET or rotate the key",
                status_code=500,
            )
        return

    if not hmac.compare_digest(recovered, token):
        raise ApiError(code="INVALID_SECRET_KEY", message="The provided secret key is invalid", status_code=401)
    if not x_timestamp:
        raise ApiError(code="TIMESTAMP_EXPIRED", message="X-Timestamp header is required", status_code=401)
    if not x_signature:
        raise ApiError(code="SIGNATURE_MISMATCH", message="X-Signature header is required", status_code=401)

    try:
        timestamp = int(x_timestamp)
    except ValueError:
        raise ApiError(code="TIMESTAMP_EXPIRED", message="X-Timestamp must be Unix UTC seconds", status_code=401) from None

    now = int(time.time())
    if abs(now - timestamp) > 300:
        raise ApiError(code="TIMESTAMP_EXPIRED", message="Request timestamp is outside the allowed 300 second window", status_code=401)

    expected = hmac.new(
        token.encode("utf-8"),
        raw_body + str(timestamp).encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, x_signature.strip().lower()):
        raise ApiError(code="SIGNATURE_MISMATCH", message="Request signature does not match", status_code=401)


async def authenticate_v2(
    request: Request,
    mt5_login: int,
    authorization: str | None,
    x_timestamp: str | None,
    x_signature: str | None,
    db: sqlite3.Connection,
) -> sqlite3.Row:
    if not authorization:
        raise ApiError(code="MISSING_SECRET_KEY", message="Authorization header is required", status_code=401)
    if not authorization.startswith("Bearer "):
        raise ApiError(code="INVALID_AUTH_FORMAT", message="Authorization must be 'Bearer <token>'", status_code=401)

    token = authorization[7:].strip()
    raw_body = await request.body()

    if token.startswith(("sk_live_", "sk_test_")):
        parts = token.split("_", 2)
        if len(parts) != 3 or len(parts[2]) < 32:
            raise ApiError(code="INVALID_SECRET_KEY", message="The provided secret key is invalid", status_code=401)
        key_prefix = parts[2][:12]
        account = db.execute(
            "SELECT * FROM accounts WHERE key_prefix = ? AND key_revoked = 0",
            (key_prefix,),
        ).fetchone()
        if account is None or not hmac.compare_digest(account["key_hash"], hash_secret(token)):
            raise ApiError(code="INVALID_SECRET_KEY", message="The provided secret key is invalid", status_code=401)
        if int(account["mt5_login"]) != int(mt5_login):
            raise ApiError(code="ACCOUNT_KEY_MISMATCH", message="The secret key cannot access this MT5 login", status_code=403)
        _verify_hmac(account, token, raw_body, x_timestamp, x_signature)
        db.execute(
            "UPDATE accounts SET key_last_used_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
            (account["id"],),
        )
        db.commit()
        return account

    if token.startswith("ts."):
        parts = token.split(".")
        if len(parts) != 3:
            raise ApiError(code="INVALID_SECRET_KEY", message="Invalid secret key", status_code=401)
        _, prefix, secret = parts
        account = db.execute(
            "SELECT * FROM accounts WHERE key_prefix = ? AND key_revoked = 0",
            (prefix,),
        ).fetchone()
        if account is None or not hmac.compare_digest(account["key_hash"], hash_secret(secret)):
            raise ApiError(code="INVALID_SECRET_KEY", message="Invalid secret key", status_code=401)
        if int(account["mt5_login"]) != int(mt5_login):
            raise ApiError(code="ACCOUNT_KEY_MISMATCH", message="Account mismatch", status_code=403)
        return account

    if hmac.compare_digest(token, settings.sync_key):
        account = db.execute("SELECT * FROM accounts WHERE mt5_login = ?", (mt5_login,)).fetchone()
        if account is None:
            raise ApiError(code="ACCOUNT_NOT_FOUND", message="Bind this MT5 account in the web console first", status_code=404)
        return account

    raise ApiError(code="INVALID_SECRET_KEY", message="The provided secret key is invalid", status_code=401)


async def get_bound_account(
    request: Request,
    payload,
    authorization: str | None,
    x_timestamp: str | None,
    x_signature: str | None,
    db: sqlite3.Connection,
    scope: str,
    window_seconds: int = 60,
) -> sqlite3.Row:
    account = await authenticate_v2(request, payload.mt5_login, authorization, x_timestamp, x_signature, db)
    check_rate_limit(scope, str(account["id"]), RATE_LIMITS[scope], window_seconds)
    return account


def ensure_unique_tickets(payload: IngestDealsRequest) -> None:
    tickets = [deal.ticket for deal in payload.deals]
    if len(tickets) != len(set(tickets)):
        raise ApiError(
            code="DUPLICATE_DEAL_TICKET_IN_REQUEST",
            message="ticket must be unique within a request",
            status_code=400,
        )


@router.post("/sync/last_sync_time", response_model=LastSyncTimeResponse)
async def get_last_sync_time(
    payload: AccountRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    db: sqlite3.Connection = Depends(get_db),
) -> LastSyncTimeResponse:
    account = await authenticate_v2(request, payload.mt5_login, authorization, x_timestamp, x_signature, db)
    check_rate_limit("last_sync_time", str(account["id"]), RATE_LIMITS["last_sync_time"])
    return LastSyncTimeResponse(last_sync_time=int(account["last_sync_time"] or 0))


@router.post("/ingest/deals", response_model=IngestDealsResponse)
async def ingest_deals_v21(
    payload: IngestDealsRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    db: sqlite3.Connection = Depends(get_db),
) -> IngestDealsResponse:
    account = await get_bound_account(request, payload, authorization, x_timestamp, x_signature, db, "deals")
    ensure_unique_tickets(payload)

    inserted = 0
    duplicates = 0
    try:
        db.execute("BEGIN IMMEDIATE")
        for deal in payload.deals:
            raw = json.dumps(deal.model_dump(), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            cursor = db.execute(
                """
                INSERT INTO deals (
                    account_login, ticket, position_id, order_id, symbol,
                    entry, type, volume, price, sl_price, tp_price,
                    profit, swap, commission, magic, comment,
                    open_time, deal_time, server_gmt_off, raw_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(account_login, ticket) DO NOTHING
                """,
                (
                    payload.mt5_login,
                    deal.ticket,
                    deal.position_id,
                    deal.order_id,
                    deal.symbol,
                    deal.entry,
                    deal.type,
                    deal.volume,
                    deal.price,
                    deal.sl_price,
                    deal.tp_price,
                    deal.profit,
                    deal.swap,
                    deal.commission,
                    deal.magic,
                    deal.comment,
                    deal.open_time,
                    deal.deal_time,
                    0,
                    raw,
                ),
            )
            if cursor.rowcount == 1:
                inserted += 1
            else:
                duplicates += 1
        # v2.1 contract: persisting deals and advancing the cursor are separate phases.
        db.commit()
    except Exception:
        db.rollback()
        raise

    return IngestDealsResponse(accepted=len(payload.deals), inserted=inserted, duplicates=duplicates)


@router.post("/sync/update_last_sync_time", response_model=UpdateLastSyncTimeResponse)
async def update_last_sync_time(
    payload: UpdateLastSyncTimeRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    db: sqlite3.Connection = Depends(get_db),
) -> UpdateLastSyncTimeResponse:
    account = await authenticate_v2(request, payload.mt5_login, authorization, x_timestamp, x_signature, db)
    check_rate_limit("update_cursor", str(account["id"]), RATE_LIMITS["update_cursor"])

    now = int(time.time())
    if payload.last_sync_time > now + 300:
        raise ApiError(code="INVALID_REQUEST", message="last_sync_time is too far in the future", status_code=400)

    current = int(account["last_sync_time"] or 0)
    if payload.last_sync_time <= current:
        return UpdateLastSyncTimeResponse(last_sync_time=current, updated=False)

    exists = db.execute(
        "SELECT 1 FROM deals WHERE account_login = ? AND open_time = ? LIMIT 1",
        (payload.mt5_login, payload.last_sync_time),
    ).fetchone()
    if exists is None:
        raise ApiError(
            code="CURSOR_AHEAD_OF_DATA",
            message="Cannot advance the cursor before a received deal has this open_time",
            status_code=409,
            details={"last_sync_time": payload.last_sync_time},
        )

    db.execute(
        """
        UPDATE accounts
        SET last_sync_time = MAX(COALESCE(last_sync_time, 0), ?),
            updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
        """,
        (payload.last_sync_time, account["id"]),
    )
    db.commit()
    return UpdateLastSyncTimeResponse(last_sync_time=payload.last_sync_time, updated=True)


@router.post("/ingest/symbols", response_model=IngestSymbolsResponse)
async def ingest_symbols_v21(
    payload: IngestSymbolsRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    db: sqlite3.Connection = Depends(get_db),
) -> IngestSymbolsResponse:
    account = await get_bound_account(request, payload, authorization, x_timestamp, x_signature, db, "symbols")
    names = [item.name for item in payload.symbols]
    if len(names) != len(set(names)):
        raise ApiError(code="DUPLICATE_SYMBOL_IN_REQUEST", message="name must be unique within a request", status_code=400)

    try:
        db.execute("BEGIN IMMEDIATE")
        for item in payload.symbols:
            raw = json.dumps(item.model_dump(), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            db.execute(
                """
                INSERT INTO symbols (
                    account_login, symbol, digits, point, contract_size,
                    tick_value, tick_size, currency_base, currency_profit, raw_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(account_login, symbol) DO UPDATE SET
                    digits=excluded.digits,
                    point=excluded.point,
                    contract_size=excluded.contract_size,
                    tick_value=excluded.tick_value,
                    tick_size=excluded.tick_size,
                    raw_json=excluded.raw_json,
                    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                """,
                (payload.mt5_login, item.name, item.digits, item.point, item.contract_size,
                 item.tick_value, item.point, "", "", raw),
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return IngestSymbolsResponse(accepted=len(payload.symbols))


@router.post("/ingest/snapshots", response_model=IngestSnapshotsResponse)
async def ingest_snapshots_v21(
    payload: IngestSnapshotsRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    db: sqlite3.Connection = Depends(get_db),
) -> IngestSnapshotsResponse:
    account = await get_bound_account(
        request, payload, authorization, x_timestamp, x_signature, db, "snapshots", window_seconds=3600
    )
    try:
        db.execute("BEGIN IMMEDIATE")
        for item in payload.snapshots:
            raw = json.dumps(item.model_dump(), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            db.execute(
                """
                INSERT OR IGNORE INTO snapshots (
                    account_login, timestamp, balance, equity, margin,
                    free_margin, margin_level, raw_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (payload.mt5_login, item.snapshot_time, item.balance, item.equity,
                 item.margin, item.free_margin, 0, raw),
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return IngestSnapshotsResponse(accepted=len(payload.snapshots))


@router.post("/ingest/heartbeat", response_model=HeartbeatResponse)
async def heartbeat_v21(
    payload: HeartbeatRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    db: sqlite3.Connection = Depends(get_db),
) -> HeartbeatResponse:
    account = await authenticate_v2(request, payload.mt5_login, authorization, x_timestamp, x_signature, db)
    check_rate_limit("heartbeat", str(account["id"]), RATE_LIMITS["heartbeat"], 3600)
    server_time = int(time.time())
    timezone_name = payload.server_timezone_name.strip()[:32] if payload.server_timezone_name else None
    raw = json.dumps(
        {
            "mt5_login": payload.mt5_login,
            "server_time": server_time,
            "version": "2.1",
            "server_gmt_offset": payload.server_gmt_offset,
            "server_timezone_name": timezone_name,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    db.execute(
        "INSERT INTO heartbeat_history (account_login, timestamp, version) VALUES (?, ?, ?)",
        (payload.mt5_login, server_time, "2.1"),
    )
    db.execute(
        """
        INSERT INTO heartbeats (
            account_login, server_gmt_off, account_currency, broker_company,
            broker_server, ea_version, server_gmt_offset, server_timezone_name, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_login) DO UPDATE SET
            ea_version=excluded.ea_version,
            server_gmt_offset=COALESCE(excluded.server_gmt_offset, heartbeats.server_gmt_offset),
            server_timezone_name=COALESCE(NULLIF(TRIM(excluded.server_timezone_name), ''), heartbeats.server_timezone_name),
            payload=excluded.payload,
            last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        """,
        (payload.mt5_login, 0, None, None, None, "2.1",
         payload.server_gmt_offset, timezone_name, raw),
    )
    db.execute(
        """
        UPDATE accounts SET
            last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            server_gmt_off=COALESCE(?, server_gmt_off),
            server_timezone_name=COALESCE(NULLIF(TRIM(?), ''), server_timezone_name),
            updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
        """,
        (payload.server_gmt_offset, timezone_name or None, account["id"]),
    )
    db.commit()
    return HeartbeatResponse(ok=True, server_time=server_time)
