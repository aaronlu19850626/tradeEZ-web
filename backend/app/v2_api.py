from __future__ import annotations

import hashlib
import hmac
import json
import sqlite3
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import APIRouter, Depends, Header
from pydantic import ValidationError

from .config import get_settings
from .db import get_db
from .v2_models import (
    ApiError,
    HeartbeatRequest,
    HeartbeatResponse,
    IngestDealsRequest,
    IngestDealsResponse,
    IngestSymbolsRequest,
    IngestSymbolsResponse,
    LastSyncTimeRequest,
    LastSyncTimeResponse,
    SnapshotRequest,
    SnapshotResponse,
)

router = APIRouter(prefix="/api/v1", tags=["v2-sync"])
settings = get_settings()

ENTRY_MAP = {"IN": 0, "OUT": 1, "INOUT": 2}
TYPE_MAP = {"BUY": 0, "SELL": 1}
RATE_LIMITS = {
    "last_sync_time": 60,
    "deals": 30,
    "symbols": 10,
    "snapshot": 120,  # 120/hour is implemented as 120/minute in this single-process dev build.
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


def authenticate_v2(mt5_login: int, authorization: str | None, db: sqlite3.Connection) -> sqlite3.Row:
    if not authorization:
        raise ApiError(
            code="MISSING_SECRET_KEY",
            message="Authorization header is required",
            status_code=401,
        )
    if not authorization.startswith("Bearer "):
        raise ApiError(
            code="INVALID_AUTH_FORMAT",
            message="Authorization must be 'Bearer <token>'",
            status_code=401,
        )

    token = authorization[7:].strip()

    if token.startswith(("sk_live_", "sk_test_")):
        remainder = token.split("_", 2)[2]
        key_prefix = remainder[:12]
        account = db.execute(
            "SELECT * FROM accounts WHERE key_prefix = ? AND key_revoked = 0",
            (key_prefix,),
        ).fetchone()
        if account is None or not hmac.compare_digest(account["key_hash"], hash_secret(token)):
            raise ApiError(
                code="INVALID_SECRET_KEY",
                message="The provided secret key is invalid",
                status_code=401,
            )
        if int(account["mt5_login"]) != int(mt5_login):
            raise ApiError(
                code="ACCOUNT_FORBIDDEN",
                message="The secret key cannot access this MT5 login",
                status_code=403,
            )
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
            raise ApiError(code="ACCOUNT_FORBIDDEN", message="Account mismatch", status_code=403)
        return account

    if hmac.compare_digest(token, settings.sync_key):
        account = db.execute("SELECT * FROM accounts WHERE mt5_login = ?", (mt5_login,)).fetchone()
        if account is None:
            raise ApiError(code="ACCOUNT_NOT_FOUND", message="Bind this MT5 account in the web console first", status_code=404)
        return account

    raise ApiError(code="INVALID_SECRET_KEY", message="The provided secret key is invalid", status_code=401)


def get_bound_account(payload, authorization: str | None, db: sqlite3.Connection, scope: str) -> sqlite3.Row:
    account = authenticate_v2(payload.mt5_login, authorization, db)
    check_rate_limit(scope, str(account["id"]), RATE_LIMITS[scope])
    return account

def validate_deal_request(request: IngestDealsRequest) -> None:
    tickets = [deal.deal_ticket for deal in request.deals]
    if len(tickets) != len(set(tickets)):
        raise ApiError(
            code="DUPLICATE_DEAL_TICKET_IN_REQUEST",
            message="deal_ticket must be unique within a request",
            status_code=400,
        )
    latest = max(deal.deal_time for deal in request.deals)
    if request.last_deal_time != latest:
        raise ApiError(
            code="INVALID_LAST_DEAL_TIME",
            message="last_deal_time must equal the latest deal_time in the batch",
            status_code=400,
            details={"provided": request.last_deal_time, "expected": latest},
        )


@router.post("/sync/last_sync_time", response_model=LastSyncTimeResponse)
def get_last_sync_time(
    payload: LastSyncTimeRequest,
    authorization: str | None = Header(default=None),
    db: sqlite3.Connection = Depends(get_db),
) -> LastSyncTimeResponse:
    account = authenticate_v2(payload.mt5_login, authorization, db)
    check_rate_limit("last_sync_time", str(account["id"]), RATE_LIMITS["last_sync_time"])
    return LastSyncTimeResponse(last_sync_time=int(account["last_sync_time"] or 0))


@router.post("/ingest/deals", response_model=IngestDealsResponse)
def ingest_deals_v2(
    payload: IngestDealsRequest,
    authorization: str | None = Header(default=None),
    db: sqlite3.Connection = Depends(get_db),
) -> IngestDealsResponse:
    account = get_bound_account(payload, authorization, db, "deals")
    validate_deal_request(payload)

    inserted = 0
    duplicates = 0
    try:
        db.execute("BEGIN IMMEDIATE")
        for deal in payload.deals:
            raw = json.dumps(deal.model_dump(), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            try:
                db.execute(
                    """
                    INSERT INTO deals (
                        account_login, ticket, position_id, order_id, symbol,
                        entry, type, volume, price, sl_price, tp_price,
                        profit, swap, commission, magic, comment,
                        deal_time, server_gmt_off, raw_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        payload.mt5_login,
                        deal.deal_ticket,
                        deal.position_id,
                        deal.order_ticket,
                        deal.symbol,
                        ENTRY_MAP[deal.entry_type],
                        TYPE_MAP[deal.deal_type],
                        deal.volume,
                        deal.price,
                        deal.sl,
                        deal.tp,
                        deal.profit,
                        deal.swap,
                        deal.commission,
                        deal.magic,
                        deal.comment or "",
                        deal.deal_time,
                        payload.server_gmt_off,
                        raw,
                    ),
                )
                inserted += 1
            except sqlite3.IntegrityError:
                duplicates += 1

        db.execute(
            """
            UPDATE accounts
            SET last_sync_time = MAX(COALESCE(last_sync_time, 0), ?),
                server_gmt_off = COALESCE(?, server_gmt_off)
            WHERE id = ?
            """,
            (payload.last_deal_time, payload.server_gmt_off, account["id"]),
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    updated = db.execute(
        "SELECT last_sync_time FROM accounts WHERE id = ?",
        (account["id"],),
    ).fetchone()["last_sync_time"]
    return IngestDealsResponse(
        accepted=len(payload.deals),
        inserted=inserted,
        duplicates=duplicates,
        last_sync_time_updated=int(updated or payload.last_deal_time),
    )

@router.post("/ingest/symbols", response_model=IngestSymbolsResponse)
def ingest_symbols_v2(
    payload: IngestSymbolsRequest,
    authorization: str | None = Header(default=None),
    db: sqlite3.Connection = Depends(get_db),
) -> IngestSymbolsResponse:
    account = get_bound_account(payload, authorization, db, "symbols")
    names = [item.symbol for item in payload.symbols]
    if len(names) != len(set(names)):
        raise ApiError(
            code="DUPLICATE_SYMBOL_IN_REQUEST",
            message="symbol must be unique within a request",
            status_code=400,
        )

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
                    currency_base=excluded.currency_base,
                    currency_profit=excluded.currency_profit,
                    raw_json=excluded.raw_json,
                    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                """,
                (
                    payload.mt5_login,
                    item.symbol,
                    item.digits,
                    item.point,
                    item.contract_size,
                    item.tick_value,
                    item.tick_size,
                    item.currency_base,
                    item.currency_profit,
                    raw,
                ),
            )
        db.commit()
    except Exception:
        db.rollback()
        raise

    return IngestSymbolsResponse(accepted=len(payload.symbols), upserted=len(payload.symbols))


@router.post("/ingest/snapshot", response_model=SnapshotResponse)
def ingest_snapshot_v2(
    payload: SnapshotRequest,
    authorization: str | None = Header(default=None),
    db: sqlite3.Connection = Depends(get_db),
) -> SnapshotResponse:
    account = authenticate_v2(payload.mt5_login, authorization, db)
    check_rate_limit("snapshot", str(account["id"]), RATE_LIMITS["snapshot"], 3600)
    raw = json.dumps(payload.model_dump(), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    db.execute(
        """
        INSERT OR IGNORE INTO snapshots (
            account_login, timestamp, balance, equity, margin,
            free_margin, margin_level, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            payload.mt5_login,
            payload.timestamp,
            payload.balance,
            payload.equity,
            payload.margin,
            payload.free_margin,
            payload.margin_level,
            raw,
        ),
    )
    db.commit()
    return SnapshotResponse(accepted=True)


@router.post("/sync/heartbeat", response_model=HeartbeatResponse)
def heartbeat_v2(
    payload: HeartbeatRequest,
    authorization: str | None = Header(default=None),
    db: sqlite3.Connection = Depends(get_db),
) -> HeartbeatResponse:
    account = authenticate_v2(payload.mt5_login, authorization, db)
    check_rate_limit("heartbeat", str(account["id"]), RATE_LIMITS["heartbeat"], 3600)
    raw = json.dumps(payload.model_dump(), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    db.execute(
        "INSERT INTO heartbeat_history (account_login, timestamp, version) VALUES (?, ?, ?)",
        (payload.mt5_login, payload.timestamp, payload.version),
    )
    db.execute(
        """
        INSERT INTO heartbeats (
            account_login, server_gmt_off, account_currency, broker_company,
            broker_server, ea_version, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_login) DO UPDATE SET
            ea_version=excluded.ea_version,
            payload=excluded.payload,
            last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        """,
        (payload.mt5_login, None, None, None, None, payload.version, raw),
    )
    db.execute(
        "UPDATE accounts SET last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        (account["id"],),
    )
    db.commit()
    return HeartbeatResponse(received=True)
