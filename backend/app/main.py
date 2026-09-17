from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import sqlite3
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, status
from starlette.responses import Response as HttpResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .api_logs import ApiLogMiddleware
from .config import get_settings
from .crypto import encrypt_sync_key
from .db import get_db, init_db
from .emailer import send_verification_email
from .schemas import (
    ApiLogOut,
    AccountCreateIn,
    AccountKeyOut,
    AccountOut,
    DealBatchIn,
    DealBatchOut,
    DealItemResult,
    DealOut,
    HeartbeatIn,
    HeartbeatOut,
    PositionOut,
    SendCodeIn,
    SendCodeOut,
    UserOut,
    VerifyCodeIn,
    VerifyCodeOut,
)
from .security import create_access_token, get_current_user
from .v2_api import router as v2_router
from .v2_models import ApiError

settings = get_settings()
bearer = HTTPBearer(auto_error=False)
DASHBOARD_PATH = Path(__file__).with_name("dashboard.html")


def require_sync_key(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> None:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer sync key",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not hmac.compare_digest(credentials.credentials, settings.sync_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid sync key")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(settings.db_path)
    app.state.db = sqlite3.connect(settings.db_path, check_same_thread=False)
    app.state.db.row_factory = sqlite3.Row
    app.state.db.execute("PRAGMA foreign_keys=ON")
    yield
    app.state.db.close()


app = FastAPI(
    title="TradeSync Minimal API",
    version="0.3.0",
    description="Email login, MT5 account setup, deal ingest, and basic synchronization dashboard.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(ApiLogMiddleware)


app.include_router(v2_router)


@app.exception_handler(ApiError)
async def api_error_handler(request, exc: ApiError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


from fastapi.exceptions import RequestValidationError


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, exc: RequestValidationError):
    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "code": "INVALID_REQUEST_BODY",
                "message": "Request body validation failed",
                "details": {"errors": exc.errors()},
            }
        },
    )






@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/dashboard")


def code_hash(email: str, code: str) -> str:
    raw = f"{email.lower()}:{code}:{settings.auth_secret}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()

@app.post("/api/v1/auth/send-code", response_model=SendCodeOut)
def send_login_code(payload: SendCodeIn, db: sqlite3.Connection = Depends(get_db)) -> SendCodeOut:
    now = int(time.time())
    email = payload.email

    latest = db.execute(
        "SELECT created_at FROM auth_codes WHERE email = ? ORDER BY id DESC LIMIT 1",
        (email,),
    ).fetchone()
    if latest and now - int(latest["created_at"]) < settings.code_cooldown_seconds:
        retry_after = settings.code_cooldown_seconds - (now - int(latest["created_at"]))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {retry_after} seconds before requesting another code",
            headers={"Retry-After": str(retry_after)},
        )

    hour_count = db.execute(
        "SELECT COUNT(*) AS count FROM auth_codes WHERE email = ? AND created_at >= ?",
        (email, now - 3600),
    ).fetchone()["count"]
    if hour_count >= settings.code_max_per_hour:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many codes requested")

    code = f"{secrets.randbelow(1_000_000):06d}"
    db.execute(
        "INSERT INTO auth_codes (email, code_hash, purpose, expires_at, created_at) VALUES (?, ?, 'login', ?, ?)",
        (email, code_hash(email, code), now + settings.code_ttl_seconds, now),
    )
    db.commit()

    try:
        send_verification_email(settings, email, code, max(1, settings.code_ttl_seconds // 60))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Verification email could not be sent. Check SMTP configuration.",
        ) from exc

    return SendCodeOut(
        message="If the email address is valid, a verification code has been sent.",
        expires_in=settings.code_ttl_seconds,
        cooldown_seconds=settings.code_cooldown_seconds,
    )


@app.post("/api/v1/auth/verify-code", response_model=VerifyCodeOut)
def verify_login_code(payload: VerifyCodeIn, db: sqlite3.Connection = Depends(get_db)) -> VerifyCodeOut:
    now = int(time.time())
    email = payload.email
    candidate_hash = code_hash(email, payload.code)
    row = db.execute(
        """
        SELECT * FROM auth_codes
        WHERE email = ? AND consumed = 0 AND expires_at > ?
        ORDER BY id DESC LIMIT 1
        """,
        (email, now),
    ).fetchone()

    if row is None or not hmac.compare_digest(row["code_hash"], candidate_hash):
        if row is not None:
            attempts = int(row["attempts"]) + 1
            if attempts >= 5:
                db.execute(
                    "UPDATE auth_codes SET consumed = 1, attempts = ?, consumed_at = ? WHERE id = ?",
                    (attempts, now, row["id"]),
                )
            else:
                db.execute("UPDATE auth_codes SET attempts = ? WHERE id = ?", (attempts, row["id"]))
            db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification code")

    db.execute("UPDATE auth_codes SET consumed = 1, consumed_at = ? WHERE id = ?", (now, row["id"]))
    existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    is_new_user = existing is None
    if is_new_user:
        db.execute("INSERT INTO users (email) VALUES (?)", (email,))
    db.execute(
        "UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE email = ?",
        (email,),
    )
    db.commit()

    user_row = db.execute(
        "SELECT id, email, created_at, last_login_at FROM users WHERE email = ?",
        (email,),
    ).fetchone()
    return VerifyCodeOut(
        access_token=create_access_token(user_row, settings),
        is_new_user=is_new_user,
        user=UserOut.model_validate(dict(user_row)),
    )


@app.get("/api/v1/users/me", response_model=UserOut)
def read_current_user(current_user: sqlite3.Row = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(dict(current_user))

def hash_sync_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def generate_sync_key(db: sqlite3.Connection) -> tuple[str, str, str, str, str]:
    while True:
        secret = secrets.token_urlsafe(32)
        prefix = secret[:12]
        if db.execute("SELECT 1 FROM accounts WHERE key_prefix = ?", (prefix,)).fetchone() is None:
            break
    full_key = f"sk_live_{secret}"
    environment = "live"
    encrypted = encrypt_sync_key(full_key, settings)
    return full_key, prefix, hash_sync_secret(full_key), encrypted, environment



def account_to_out(row: sqlite3.Row, db: sqlite3.Connection) -> AccountOut:
    stats = db.execute(
        """
        SELECT
            COUNT(*) AS deal_count,
            COUNT(DISTINCT CASE
                WHEN position_id > 0
                 AND TRIM(COALESCE(symbol, '')) <> ''
                 AND volume > 0
                 AND price > 0
                 AND entry IN (0, 2)
                THEN position_id
            END) AS synced_order_count,
            MAX(deal_time) AS latest_deal_time
        FROM deals
        WHERE account_login = ?
        """,
        (row["mt5_login"],),
    ).fetchone()
    symbol_stats = db.execute(
        "SELECT COUNT(*) AS symbol_count FROM symbols WHERE account_login = ?",
        (row["mt5_login"],),
    ).fetchone()
    snapshot_stats = db.execute(
        """
        SELECT COUNT(*) AS snapshot_count,
               MAX(timestamp) AS latest_snapshot_time,
               (SELECT equity FROM snapshots WHERE account_login = ? ORDER BY timestamp DESC LIMIT 1) AS latest_equity
        FROM snapshots
        WHERE account_login = ?
        """,
        (row["mt5_login"], row["mt5_login"]),
    ).fetchone()
    data = dict(row)
    data["deal_count"] = int(stats["deal_count"] or 0)
    data["synced_order_count"] = int(stats["synced_order_count"] or 0)
    data["latest_deal_time"] = stats["latest_deal_time"]
    data["symbol_count"] = int(symbol_stats["symbol_count"] or 0)
    data["snapshot_count"] = int(snapshot_stats["snapshot_count"] or 0)
    data["latest_snapshot_time"] = snapshot_stats["latest_snapshot_time"]
    data["latest_equity"] = snapshot_stats["latest_equity"]
    return AccountOut.model_validate(data)


def get_owned_account(account_id: int, user: sqlite3.Row, db: sqlite3.Connection) -> sqlite3.Row:
    row = db.execute("SELECT * FROM accounts WHERE id = ? AND user_id = ?", (account_id, user["id"])).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MT5 account not found")
    return row


@app.post("/api/v1/accounts", response_model=AccountKeyOut, status_code=201)
def create_account(
    payload: AccountCreateIn,
    db: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(get_current_user),
) -> AccountKeyOut:
    existing = db.execute("SELECT id, user_id FROM accounts WHERE mt5_login = ?", (payload.mt5_login,)).fetchone()
    if existing is not None:
        if int(existing["user_id"]) == int(user["id"]):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This MT5 account is already bound to you")
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This MT5 account is already bound to another user")

    sync_key, prefix, key_hash, encrypted_key, key_environment = generate_sync_key(db)
    cursor = db.execute(
        """
        INSERT INTO accounts (
            user_id, mt5_login, label, broker_server, account_currency,
            server_gmt_off, key_prefix, key_hash, key_encrypted,
            key_environment, key_created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        """,
        (user["id"], payload.mt5_login, payload.label, payload.broker_server,
         payload.account_currency, payload.server_gmt_off, prefix, key_hash,
         encrypted_key, key_environment),
    )
    db.commit()
    row = db.execute("SELECT * FROM accounts WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return AccountKeyOut(
        **account_to_out(row, db).model_dump(),
        sync_key=sync_key,
        message="Sync key is shown only once. Copy it into the EA; reset it if lost.",
    )


@app.get("/api/v1/accounts", response_model=list[AccountOut])
def list_accounts(
    db: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(get_current_user),
) -> list[AccountOut]:
    rows = db.execute("SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC, id DESC", (user["id"],)).fetchall()
    return [account_to_out(row, db) for row in rows]


@app.get("/api/v1/accounts/{account_id}", response_model=AccountOut)
def get_account(
    account_id: int,
    db: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(get_current_user),
) -> AccountOut:
    return account_to_out(get_owned_account(account_id, user, db), db)


@app.post("/api/v1/accounts/{account_id}/regenerate-key", response_model=AccountKeyOut)
def regenerate_account_key(
    account_id: int,
    db: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(get_current_user),
) -> AccountKeyOut:
    get_owned_account(account_id, user, db)
    sync_key, prefix, key_hash, encrypted_key, key_environment = generate_sync_key(db)
    db.execute(
        """
        UPDATE accounts SET
            key_prefix = ?,
            key_hash = ?,
            key_encrypted = ?,
            key_environment = ?,
            key_revoked = 0,
            key_created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            key_last_used_at = NULL,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
        """,
        (prefix, key_hash, encrypted_key, key_environment, account_id),
    )
    db.commit()
    row = db.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
    return AccountKeyOut(
        **account_to_out(row, db).model_dump(),
        sync_key=sync_key,
        message="Old key has been replaced. Update EA SyncKey and reload the EA.",
    )


@app.get("/api/v1/my/accounts/{account_id}/deals", response_model=list[DealOut])
def my_account_deals(
    account_id: int,
    limit: int = Query(100, ge=1, le=500),
    db: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(get_current_user),
) -> list[sqlite3.Row]:
    account = get_owned_account(account_id, user, db)
    rows = db.execute(
        "SELECT * FROM deals WHERE account_login = ? ORDER BY deal_time DESC, ticket DESC LIMIT ?",
        (account["mt5_login"], limit),
    ).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/v1/my/accounts/{account_id}/positions", response_model=list[PositionOut])
def my_account_positions(
    account_id: int,
    include_closed: bool = True,
    db: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(get_current_user),
) -> list[PositionOut]:
    account = get_owned_account(account_id, user, db)
    return pair_positions(db, int(account["mt5_login"]), include_closed=include_closed)



@app.get("/api/v1/my/api-logs", response_model=list[ApiLogOut])
def my_api_logs(
    limit: int = Query(100, ge=1, le=500),
    mt5_login: int | None = Query(default=None),
    success: bool | None = Query(default=None),
    db: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(get_current_user),
) -> list[ApiLogOut]:
    where = [
        "(l.user_id = ? OR l.account_id IN (SELECT id FROM accounts WHERE user_id = ?) OR l.mt5_login IN (SELECT mt5_login FROM accounts WHERE user_id = ?))"
    ]
    params: list[object] = [user["id"], user["id"], user["id"]]
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

    result: list[ApiLogOut] = []
    for row in rows:
        item = dict(row)
        item["success"] = bool(item.get("success"))
        item["request_summary"] = json.loads(item.get("request_summary") or "{}")
        item["response_summary"] = json.loads(item.get("response_summary") or "{}")
        result.append(ApiLogOut.model_validate(item))
    return result


def authenticate_ingest(
    credentials: HTTPAuthorizationCredentials | None,
    account_login: int,
    db: sqlite3.Connection,
) -> sqlite3.Row | None:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer sync key")

    raw_key = credentials.credentials.strip()
    parts = raw_key.split(".")
    if len(parts) == 3 and parts[0] == "ts":
        _, prefix, secret = parts
        account = db.execute(
            "SELECT * FROM accounts WHERE key_prefix = ? AND key_revoked = 0",
            (prefix,),
        ).fetchone()
        if account is None or not hmac.compare_digest(account["key_hash"], hash_sync_secret(secret)):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked MT5 sync key")
        if int(account["mt5_login"]) != int(account_login):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sync key does not belong to this MT5 login")
        return account

    if hmac.compare_digest(raw_key, settings.sync_key):
        return db.execute("SELECT * FROM accounts WHERE mt5_login = ?", (account_login,)).fetchone()

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MT5 sync key")


@app.post("/internal/legacy/ingest/deals", response_model=DealBatchOut)
def ingest_deals(
    payload: DealBatchIn,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: sqlite3.Connection = Depends(get_db),
) -> DealBatchOut:
    authenticate_ingest(credentials, payload.account_login, db)
    accepted = 0
    duplicated = 0
    items: list[DealItemResult] = []

    try:
        db.execute("BEGIN IMMEDIATE")
        for deal in payload.deals:
            raw = json.dumps(deal.model_dump(), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            try:
                cursor = db.execute(
                    """
                    INSERT INTO deals (
                        account_login, ticket, position_id, order_id, symbol,
                        entry, type, volume, price, sl_price, tp_price,
                        profit, swap, commission, magic, comment,
                        open_time, deal_time, server_gmt_off, raw_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (payload.account_login, deal.ticket, deal.position_id, deal.order_id, deal.symbol,
                     deal.entry, deal.type, deal.volume, deal.price, deal.sl_price, deal.tp_price,
                     deal.profit, deal.swap, deal.commission, deal.magic, deal.comment,
                     deal.deal_time, deal.deal_time, payload.server_gmt_off, raw),
                )
                if cursor.rowcount == 1:
                    accepted += 1
                    items.append(DealItemResult(ticket=deal.ticket, status="accepted"))
            except sqlite3.IntegrityError:
                duplicated += 1
                items.append(DealItemResult(ticket=deal.ticket, status="duplicated"))
        db.commit()
    except Exception:
        db.rollback()
        raise

    row = db.execute("SELECT MAX(ticket) AS max_ticket FROM deals WHERE account_login = ?", (payload.account_login,)).fetchone()
    return DealBatchOut(
        account_login=payload.account_login,
        accepted=accepted,
        duplicated=duplicated,
        rejected=0,
        max_ticket=row["max_ticket"],
        items=items,
    )


@app.post("/api/v1/ingest/heartbeat", response_model=HeartbeatOut)
def heartbeat(
    payload: HeartbeatIn,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: sqlite3.Connection = Depends(get_db),
) -> HeartbeatOut:
    account = authenticate_ingest(credentials, payload.account_login, db)
    raw = json.dumps(payload.model_dump(), ensure_ascii=False, sort_keys=True)
    db.execute(
        """
        INSERT INTO heartbeats (
            account_login, server_gmt_off, account_currency, broker_company,
            broker_server, ea_version, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_login) DO UPDATE SET
            server_gmt_off=excluded.server_gmt_off,
            account_currency=excluded.account_currency,
            broker_company=excluded.broker_company,
            broker_server=excluded.broker_server,
            ea_version=excluded.ea_version,
            payload=excluded.payload,
            last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        """,
        (payload.account_login, payload.server_gmt_off, payload.account_currency,
         payload.broker_company, payload.broker_server, payload.ea_version, raw),
    )
    if account is not None:
        db.execute(
            """
            UPDATE accounts SET
                last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                server_gmt_off=COALESCE(?, server_gmt_off),
                account_currency=COALESCE(?, account_currency),
                broker_company=COALESCE(?, broker_company),
                broker_server=COALESCE(?, broker_server)
            WHERE id = ?
            """,
            (payload.server_gmt_off, payload.account_currency, payload.broker_company,
             payload.broker_server, account["id"]),
        )
    db.commit()
    row = db.execute("SELECT last_seen_at FROM heartbeats WHERE account_login = ?", (payload.account_login,)).fetchone()
    return HeartbeatOut(account_login=payload.account_login, last_seen_at=row["last_seen_at"])

@app.get("/api/v1/deals", response_model=list[DealOut])
def list_deals(
    account_login: int = Query(..., ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: sqlite3.Connection = Depends(get_db),
    _: None = Depends(require_sync_key),
) -> list[sqlite3.Row]:
    rows = db.execute(
        "SELECT * FROM deals WHERE account_login = ? ORDER BY deal_time DESC, ticket DESC LIMIT ?",
        (account_login, limit),
    ).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/v1/positions", response_model=list[PositionOut])
def list_positions_compat(
    account_login: int = Query(..., ge=0),
    include_closed: bool = True,
    db: sqlite3.Connection = Depends(get_db),
    _: None = Depends(require_sync_key),
) -> list[PositionOut]:
    return pair_positions(db, account_login, include_closed=include_closed)


@app.get("/api/v1/heartbeats")
def list_heartbeats(
    db: sqlite3.Connection = Depends(get_db),
    _: None = Depends(require_sync_key),
) -> list[dict]:
    rows = db.execute(
        "SELECT account_login, server_gmt_off, account_currency, broker_company, broker_server, ea_version, last_seen_at FROM heartbeats ORDER BY last_seen_at DESC"
    ).fetchall()
    return [dict(row) for row in rows]


def pair_positions(db: sqlite3.Connection, account_login: int, include_closed: bool = True) -> list[PositionOut]:
    rows = db.execute(
        """
        SELECT * FROM deals
        WHERE account_login = ?
          AND position_id IS NOT NULL AND position_id <> 0
          AND symbol IS NOT NULL AND TRIM(symbol) <> ''
        ORDER BY deal_time ASC, ticket ASC
        """,
        (account_login,),
    ).fetchall()

    grouped: dict[int, list[sqlite3.Row]] = defaultdict(list)
    for row in rows:
        grouped[row["position_id"]].append(row)

    positions: list[PositionOut] = []
    for position_id, deals in grouped.items():
        volume_in = volume_out = open_value = close_value = net_pnl = 0.0
        swap_total = commission_total = 0.0
        open_time = close_time = None
        sl_price = tp_price = None
        magic = None
        comment = None
        direction = None

        for deal in deals:
            volume = float(deal["volume"])
            price = float(deal["price"])
            entry = int(deal["entry"])
            swap_total += float(deal["swap"])
            commission_total += float(deal["commission"])
            if entry in (0, 2):
                if volume_in == 0:
                    open_time = int(deal["open_time"] or deal["deal_time"])
                    sl_price = deal["sl_price"]
                    tp_price = deal["tp_price"]
                    magic = int(deal["magic"])
                    comment = deal["comment"]
                    direction = "buy" if int(deal["type"]) == 0 else "sell"
                open_value += price * volume
                volume_in += volume
            if entry in (1, 2):
                close_value += price * volume
                volume_out += volume
                net_pnl += float(deal["profit"]) + float(deal["swap"]) + float(deal["commission"])
                close_time = int(deal["deal_time"])

        # A close-only record can arrive during limited history sync, but it is not
        # a valid paired order until its opening-side deal has been synchronized.
        if volume_in <= 0:
            continue
        open_price = open_value / volume_in
        close_price = close_value / volume_out if volume_out else None
        is_closed = volume_out + 1e-9 >= volume_in
        hold_seconds = close_time - open_time if is_closed and open_time is not None and close_time is not None else None
        positions.append(
            PositionOut(
                account_login=account_login,
                position_id=position_id,
                symbol=deals[0]["symbol"],
                strategy=classify_strategy(magic, comment),
                direction=direction or "unknown",
                volume_in=round(volume_in, 8),
                volume_out=round(volume_out, 8),
                open_price=round(open_price, 8) if open_price is not None else None,
                close_price=round(close_price, 8) if close_price is not None else None,
                sl_price=sl_price,
                tp_price=tp_price,
                swap_total=round(swap_total, 8),
                commission_total=round(commission_total, 8),
                net_pnl=round(net_pnl, 8),
                open_time=open_time,
                close_time=close_time if is_closed else None,
                hold_seconds=hold_seconds,
                is_closed=is_closed,
                magic=magic,
                comment=comment,
            )
        )

    positions.sort(key=lambda item: (item.open_time or 0, item.position_id), reverse=True)
    if not include_closed:
        positions = [item for item in positions if not item.is_closed]
    return positions


def classify_strategy(magic: int | None, comment: str | None) -> str:
    text = (comment or "").upper()
    if magic == 920717 or "TRADEEZ-SC" in text or "GOLDSOP-SC" in text:
        return "scalp"
    if magic == 920718 or "TRADEEZ-TR" in text or "GOLDSOP-TR" in text:
        return "trend"
    if magic:
        return "other"
    return "manual"


@app.get("/dashboard", include_in_schema=False)
@app.get("/register", include_in_schema=False)
@app.get("/login", include_in_schema=False)
def dashboard_page() -> FileResponse:
    return FileResponse(DASHBOARD_PATH)
