from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .account_center.router import router as accounts_router
from .api_logs import ApiLogMiddleware
from .common.retention import start_retention_worker
from .config import get_settings
from .connectors.router import router as connectors_router
from .db import DBConnection, connect_db, get_db, init_db
from .preferences.router import router as preferences_router
from .internal_timezone import router as internal_timezone_router
from .sync.router import router as sync_router
from .trade_center.router import router as trade_center_router
from .v2_models import ApiError
from .web_auth.router import router as web_auth_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(settings.database_url)
    # The audit-log middleware keeps a dedicated connection. Business endpoints
    # use a per-request connection from app.db.get_db to avoid shared transaction
    # state when several EA batches arrive concurrently.
    app.state.db = connect_db(application_name="tradesync-middleware")
    # Trims the append-only heartbeat history once a day (advisory-locked so
    # extra instances cannot duplicate the work).
    start_retention_worker()
    yield
    app.state.db.close()


app = FastAPI(
    title="TradeSync API",
    version="0.4.0",
    description="Email/phone login, MT5 account management, and EA data synchronization.",
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

app.include_router(sync_router)
app.include_router(connectors_router)
app.include_router(accounts_router)
app.include_router(trade_center_router)
app.include_router(preferences_router)
app.include_router(web_auth_router)
app.include_router(internal_timezone_router)


@app.exception_handler(ApiError)
async def api_error_handler(request, exc: ApiError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


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
def root() -> dict[str, str]:
    return {"name": "TradeSync API", "docs": "/docs"}
