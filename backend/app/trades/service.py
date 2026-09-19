from __future__ import annotations

from app.db import DBConnection, DBRow

from fastapi import HTTPException, status
from ..accounts.service import get_owned_account
from ..schemas import PositionOut, OrderPageOut
from . import repository, projection
from .aggregation import build_positions


def pair_positions(db: DBConnection, account_login: int, include_closed: bool = True) -> list[PositionOut]:
    return build_positions(account_login, repository.position_deals(db, account_login), include_closed)


def my_orders(account_id: int | None, page: int, page_size: int, symbol: str | None, direction: str | None, status_filter: str | None, start_time: int | None, end_time: int | None, sort: str, db: DBConnection, user: DBRow, review_status: str | None = None, reconciliation_case: str | None = None) -> OrderPageOut:
    accounts = repository.owned_accounts(db, user["id"])
    if account_id is not None:
        accounts = [row for row in accounts if int(row["id"]) == account_id]
        if not accounts:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MT5 account not found")

    projection.refresh(db, user["id"])
    page_items, total = projection.page(db, user["id"], account_id, page, page_size,
                                        symbol, direction, status_filter, start_time, end_time, sort, review_status,
                                        reconciliation_case)
    timezone_name = None
    currency = None
    if len(accounts) == 1:
        timezone_name = accounts[0]["server_timezone_name"]
        currency = accounts[0]["account_currency"]
    return OrderPageOut(
        items=page_items,
        total=total,
        page=page,
        page_size=page_size,
        server_timezone_name=timezone_name,
        account_currency=currency,
    )


def my_account_positions(account_id: int, include_closed: bool, db: DBConnection, user: DBRow) -> list[PositionOut]:
    account = get_owned_account(account_id, user, db)
    return pair_positions(db, int(account["mt5_login"]), include_closed=include_closed)
