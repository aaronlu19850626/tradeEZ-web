from __future__ import annotations

import sqlite3
import json
from fastapi import HTTPException
from ..schemas import DealDetailOut, DealSourceBatchOut
from ..accounts.service import get_owned_account
from ..schemas import (DealOut, RawDealPageOut, EaSettingsSnapshotOut,
    SnapshotSeriesOut, SnapshotPointOut, SymbolSpecOut, SymbolSpecPageOut)
from . import repository


def deal_detail(
    account_id: int, ticket: int, page: int, page_size: int,
    db: sqlite3.Connection, user: sqlite3.Row,
) -> DealDetailOut:
    account = get_owned_account(account_id, user, db)
    login = int(account["mt5_login"])
    deal = repository.deal_by_ticket(db, login, ticket)
    if deal is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    rows, total = repository.source_batches(db, account_id, login, ticket, page, page_size)
    return DealDetailOut(
        deal=DealOut.model_validate(dict(deal)),
        source_batches=[DealSourceBatchOut.model_validate(dict(row)) for row in rows],
        source_total=total, page=page, page_size=page_size,
    )


def my_raw_deals(account_id: int | None, ticket: int | None, position_id: int | None, order_id: int | None, symbol: str | None, entry: int | None, start_time: int | None, end_time: int | None, page: int, page_size: int, sort: str, db: sqlite3.Connection, user: sqlite3.Row) -> RawDealPageOut:
    account_login = None
    if account_id is not None:
        account_login = int(get_owned_account(account_id, user, db)["mt5_login"])
    rows, total = repository.raw_deals(db, user["id"], account_login, ticket, position_id, order_id, symbol, entry, start_time, end_time, page, page_size, sort)
    return RawDealPageOut(items=[DealOut.model_validate(dict(row)) for row in rows], total=total, page=page, page_size=page_size)


def my_account_deals(account_id: int, limit: int, db: sqlite3.Connection, user: sqlite3.Row) -> list[DealOut]:
    account = get_owned_account(account_id, user, db)
    return [DealOut.model_validate(dict(row)) for row in repository.account_deals(db, int(account["mt5_login"]), limit)]


def my_account_settings(account_id: int, limit: int, db: sqlite3.Connection, user: sqlite3.Row) -> list[EaSettingsSnapshotOut]:
    account = get_owned_account(account_id, user, db)
    rows = repository.account_settings(db, int(account["mt5_login"]), limit)
    result: list[EaSettingsSnapshotOut] = []
    for row in rows:
        item = dict(row)
        item["settings"] = json.loads(item.pop("settings_json") or "{}")
        result.append(EaSettingsSnapshotOut.model_validate(item))
    return result


def my_account_snapshots(account_id, start_time, end_time, limit, db, user) -> SnapshotSeriesOut:
    account = get_owned_account(account_id, user, db)
    if start_time is not None and end_time is not None and start_time > end_time:
        raise HTTPException(status_code=400, detail="start_time must be before end_time")
    rows, total = repository.account_snapshots(db, int(account["mt5_login"]), start_time, end_time, limit)
    return SnapshotSeriesOut(
        account_id=account_id,
        currency=account["account_currency"] if "account_currency" in account.keys() else None,
        total=total,
        start_time=start_time,
        end_time=end_time,
        limit=limit,
        items=[SnapshotPointOut(
            timestamp=row["timestamp"],
            balance=row["balance"],
            equity=row["equity"],
            margin=row["margin"],
            free_margin=row["free_margin"],
            margin_level=(row["margin_level"] or None),
        ) for row in rows],
    )


def my_account_symbols(account_id, q, page, page_size, db, user) -> SymbolSpecPageOut:
    account = get_owned_account(account_id, user, db)
    rows, total = repository.account_symbols(db, int(account["mt5_login"]), q, page, page_size)
    return SymbolSpecPageOut(
        items=[SymbolSpecOut(
            symbol=row["symbol"],
            digits=row["digits"],
            point=row["point"],
            tick_size=row["tick_size"],
            tick_value=row["tick_value"],
            contract_size=row["contract_size"],
            currency_base=(row["currency_base"] or None),
            currency_profit=(row["currency_profit"] or None),
            updated_at=row["updated_at"],
        ) for row in rows],
        total=total, page=page, page_size=page_size,
    )
