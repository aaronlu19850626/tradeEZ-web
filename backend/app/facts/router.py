from __future__ import annotations

import sqlite3
from fastapi import APIRouter, Depends, Query
from ..db import get_db
from ..security import get_current_user
from ..schemas import (DealOut, RawDealPageOut, EaSettingsSnapshotOut,
    SnapshotSeriesOut, SymbolSpecPageOut)
from . import service
from ..schemas import DealDetailOut

router = APIRouter(tags=["facts-queries"])


@router.get("/api/v1/my/accounts/{account_id}/deals/{ticket}", response_model=DealDetailOut)
def deal_detail(
    account_id: int,
    ticket: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(get_current_user),
) -> DealDetailOut:
    return service.deal_detail(account_id, ticket, page, page_size, db, user)

@router.get("/api/v1/my/raw-deals", response_model=RawDealPageOut)
def my_raw_deals(
    account_id: int | None = Query(default=None),
    ticket: int | None = Query(default=None, gt=0),
    position_id: int | None = Query(default=None, ge=0),
    order_id: int | None = Query(default=None, ge=0),
    symbol: str | None = Query(default=None, max_length=64),
    entry: int | None = Query(default=None, ge=0, le=3),
    start_time: int | None = Query(default=None, ge=0),
    end_time: int | None = Query(default=None, ge=0),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort: str = Query("deal_time_desc", pattern="^(deal_time_desc|deal_time_asc|open_time_desc|open_time_asc|ticket_desc|ticket_asc)$"),
    db: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(get_current_user),
) -> RawDealPageOut:
    return service.my_raw_deals(account_id, ticket, position_id, order_id, symbol, entry, start_time, end_time, page, page_size, sort, db, user)


@router.get("/api/v1/my/accounts/{account_id}/deals", response_model=list[DealOut])
def my_account_deals(
    account_id: int,
    limit: int = Query(100, ge=1, le=500),
    db: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(get_current_user),
) -> list[DealOut]:
    return service.my_account_deals(account_id, limit, db, user)


@router.get("/api/v1/my/accounts/{account_id}/settings", response_model=list[EaSettingsSnapshotOut])
def my_account_settings(
    account_id: int,
    limit: int = Query(20, ge=1, le=100),
    db: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(get_current_user),
) -> list[EaSettingsSnapshotOut]:
    return service.my_account_settings(account_id, limit, db, user)


@router.get("/api/v1/my/accounts/{account_id}/snapshots", response_model=SnapshotSeriesOut)
def my_account_snapshots(
    account_id: int,
    start_time: int | None = Query(default=None, ge=0),
    end_time: int | None = Query(default=None, ge=0),
    limit: int = Query(500, ge=1, le=2000),
    db=Depends(get_db),
    user=Depends(get_current_user),
) -> SnapshotSeriesOut:
    return service.my_account_snapshots(account_id, start_time, end_time, limit, db, user)


@router.get("/api/v1/my/accounts/{account_id}/symbols", response_model=SymbolSpecPageOut)
def my_account_symbols(
    account_id: int,
    q: str | None = Query(default=None, max_length=50),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db=Depends(get_db),
    user=Depends(get_current_user),
) -> SymbolSpecPageOut:
    return service.my_account_symbols(account_id, q, page, page_size, db, user)
