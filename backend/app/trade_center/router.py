from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.db import DBConnection, DBRow, get_db
from app.security import get_current_user

from . import service
from .schemas import (
    CalendarDayOut,
    BoundsOut,
    GroupOut,
    SummaryOut,
    TradeFilter,
    TradePageOut,
)

router = APIRouter(tags=["trade-center"])


@router.get("/api/v1/trades", response_model=TradePageOut)
def list_trades(
    flt: TradeFilter = Depends(),
    sort: str = Query(default="closeTime"),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=1000),
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> TradePageOut:
    items, total = service.list_trades(db, user, flt, sort, order, page, page_size)
    return TradePageOut(items=items, total=total, page=page, page_size=page_size)


@router.get("/api/v1/trades/summary", response_model=SummaryOut)
def summary(
    flt: TradeFilter = Depends(),
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> SummaryOut:
    return service.summary(db, user, flt)


@router.get("/api/v1/trades/groups", response_model=list[GroupOut])
def groups(
    view: str = Query(default="day", pattern="^(day|week)$"),
    flt: TradeFilter = Depends(),
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> list[GroupOut]:
    return service.groups(db, user, flt, view, limit=limit, offset=offset)


@router.get("/api/v1/trades/calendar", response_model=list[CalendarDayOut])
def calendar(
    month: str = Query(pattern=r"\d{4}-\d{2}"),
    flt: TradeFilter = Depends(),
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> list[CalendarDayOut]:
    return service.calendar(db, user, flt, month)


@router.get("/api/v1/trades/symbols", response_model=list[str])
def symbols(
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> list[str]:
    return service.symbols(db, user)


@router.get("/api/v1/trades/currencies", response_model=list[str])
def currencies(
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> list[str]:
    return service.currencies(db, user)


@router.get("/api/v1/trades/bounds", response_model=BoundsOut)
def bounds(
    flt: TradeFilter = Depends(),
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> BoundsOut:
    return service.bounds(db, user, flt)
