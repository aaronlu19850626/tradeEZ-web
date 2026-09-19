from __future__ import annotations

from app.db import DBConnection, DBRow

import hmac
import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Query,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .api_logs import ApiLogMiddleware
from .config import get_settings
from .db import DBConnection, DBRow, connect_db, get_db, init_db
from .schemas import (
    DealBatchIn,
    DealBatchOut,
    DealItemResult,
    DealOut,
    HeartbeatIn,
    HeartbeatOut,
    PositionOut,
)
from .sync.router import router as v2_router
from .facts.router import router as facts_router
from .trades.router import router as trades_router
from .trades.attachments import router as attachments_router
from .sync.query_router import router as sync_query_router
from .sync.overview import router as sync_overview_router
from .trades.service import pair_positions
from .accounts.router import router as accounts_router
from .web_auth.router import router as web_auth_router
from .playbooks.router import router as playbooks_router
from .playbooks.evaluations import router as evaluations_router
from .planning.router import router as planning_router
from .planning.intentions import router as intentions_router
from .planning.daily_reviews import router as daily_reviews_router
from .workspace_settings import router as workspace_settings_router
from .weekly_reviews import router as weekly_reviews_router
from .habits import router as habits_router
from .accounts.service import hash_sync_secret
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
    init_db(settings.database_url)
    # The audit-log middleware keeps a dedicated connection. Business endpoints
    # use a per-request connection from app.db.get_db to avoid shared transaction
    # state when several EA batches arrive concurrently.
    app.state.db = connect_db(application_name="tradesync-middleware")
    yield
    app.state.db.close()


app = FastAPI(
    title="TradeSync Minimal API",
    version="0.3.0",
    description="Email login, MT5 account setup, deal ingest, and basic synchronization dashboard.",
    lifespan=lifespan,
)
app.include_router(attachments_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(ApiLogMiddleware)


app.include_router(v2_router)
app.include_router(facts_router)
app.include_router(trades_router)
app.include_router(sync_query_router)
app.include_router(sync_overview_router)
app.include_router(accounts_router)
app.include_router(web_auth_router)
app.include_router(playbooks_router)
app.include_router(evaluations_router)
app.include_router(planning_router)
app.include_router(intentions_router)
app.include_router(daily_reviews_router)
app.include_router(workspace_settings_router)
app.include_router(weekly_reviews_router)
app.include_router(habits_router)


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
                # Do not echo request values (secrets, NaN/Infinity) or exception objects.
                "details": {"errors": [
                    {"type": error["type"], "loc": error["loc"], "msg": error["msg"]}
                    for error in exc.errors()
                ]},
            }
        },
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/healthz", include_in_schema=False)
def healthz() -> dict[str, str]:
    """Liveness probe: never touches the database or exposes configuration."""
    return {"status": "ok"}


@app.get("/readyz", include_in_schema=False)
def readyz(db: DBConnection = Depends(get_db)) -> JSONResponse:
    """Readiness probe: database reachable and migrated to the expected revision."""
    from alembic.script import ScriptDirectory
    from .migrations import migration_config
    expected = ScriptDirectory.from_config(migration_config()).get_current_head()
    try:
        db.execute("SELECT 1").fetchone()
        row = db.execute("SELECT version_num FROM alembic_version").fetchone()
    except Exception:
        return JSONResponse(status_code=503, content={"status": "not-ready", "database": "unavailable"})
    current = row["version_num"] if row is not None else None
    if current != expected:
        return JSONResponse(
            status_code=503,
            content={"status": "not-ready", "database": "migration-pending", "version": current},
        )
    return JSONResponse(content={"status": "ready", "version": current})


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/dashboard")


def authenticate_ingest(
    credentials: HTTPAuthorizationCredentials | None,
    account_login: int,
    db: DBConnection,
) -> DBRow | None:
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
        if "status" in account.keys() and account["status"] != "active":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This MT5 account is disabled")
        return account

    if hmac.compare_digest(raw_key, settings.sync_key):
        account = db.execute("SELECT * FROM accounts WHERE mt5_login = ?", (account_login,)).fetchone()
        if account is None:
            raise HTTPException(status_code=404, detail="MT5 account not found")
        if account["key_encrypted"]:
            raise HTTPException(status_code=401, detail="This account requires its signed per-account sync key")
        if account is not None and "status" in account.keys() and account["status"] != "active":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This MT5 account is disabled")
        return account

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MT5 sync key")

@app.post("/internal/legacy/ingest/deals", response_model=DealBatchOut)
def ingest_deals(
    payload: DealBatchIn,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: DBConnection = Depends(get_db),
) -> DealBatchOut:
    authenticate_ingest(credentials, payload.account_login, db)
    accepted = 0
    duplicated = 0
    items: list[DealItemResult] = []

    try:
        db.execute("BEGIN IMMEDIATE")
        authenticate_ingest(credentials, payload.account_login, db)
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
                (payload.account_login, deal.ticket, deal.position_id, deal.order_id, deal.symbol,
                 deal.entry, deal.type, deal.volume, deal.price, deal.sl_price, deal.tp_price,
                 deal.profit, deal.swap, deal.commission, deal.magic, deal.comment,
                 deal.deal_time, deal.deal_time, payload.server_gmt_off, raw),
            )
            if cursor.rowcount == 1:
                accepted += 1
                items.append(DealItemResult(ticket=deal.ticket, status="accepted"))
            else:
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
    db: DBConnection = Depends(get_db),
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
                server_gmt_off=CASE WHEN ? = 0 THEN NULL ELSE COALESCE(?, server_gmt_off) END,
                account_currency=COALESCE(?, account_currency),
                broker_company=COALESCE(?, broker_company),
                broker_server=COALESCE(?, broker_server)
            WHERE id = ?
            """,
            (payload.server_gmt_off, payload.server_gmt_off, payload.account_currency,
             payload.broker_company, payload.broker_server, account["id"]),
        )
    db.commit()
    row = db.execute("SELECT last_seen_at FROM heartbeats WHERE account_login = ?", (payload.account_login,)).fetchone()
    return HeartbeatOut(account_login=payload.account_login, last_seen_at=row["last_seen_at"])

@app.get("/api/v1/deals", response_model=list[DealOut])
def list_deals(
    account_login: int = Query(..., ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: DBConnection = Depends(get_db),
    _: None = Depends(require_sync_key),
) -> list[DBRow]:
    rows = db.execute(
        "SELECT * FROM deals WHERE account_login = ? ORDER BY deal_time DESC, ticket DESC LIMIT ?",
        (account_login, limit),
    ).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/v1/positions", response_model=list[PositionOut])
def list_positions_compat(
    account_login: int = Query(..., ge=0),
    include_closed: bool = True,
    db: DBConnection = Depends(get_db),
    _: None = Depends(require_sync_key),
) -> list[PositionOut]:
    return pair_positions(db, account_login, include_closed=include_closed)


@app.get("/api/v1/heartbeats")
def list_heartbeats(
    db: DBConnection = Depends(get_db),
    _: None = Depends(require_sync_key),
) -> list[dict]:
    rows = db.execute(
        "SELECT account_login, server_gmt_off, account_currency, broker_company, broker_server, ea_version, last_seen_at FROM heartbeats ORDER BY last_seen_at DESC"
    ).fetchall()
    return [dict(row) for row in rows]


@app.get("/dashboard", include_in_schema=False)
@app.get("/register", include_in_schema=False)
@app.get("/login", include_in_schema=False)
def dashboard_page() -> FileResponse:
    return FileResponse(
        DASHBOARD_PATH,
        headers={"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"},
    )
