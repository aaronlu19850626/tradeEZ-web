from __future__ import annotations

import sqlite3
import csv
import io
from datetime import date
from typing import Literal
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import Response
from ..db import get_db
from ..security import get_current_user
from ..schemas import PositionOut, OrderPageOut, TradeDetailOut, TradeAllocationOut
from . import service, projection
from . import reviews
from . import tag_maintenance
from .reflection import Emotion, ErrorCode
from . import reconciliation

router = APIRouter(tags=["trades-queries"])


@router.get("/api/v1/my/tag-definitions")
def tag_definitions(db: sqlite3.Connection = Depends(get_db), user: sqlite3.Row = Depends(get_current_user)):
    return tag_maintenance.definitions(db, user["id"])


@router.patch("/api/v1/my/tag-definitions/{definition_id}")
def tag_definition_update(definition_id: int, payload: tag_maintenance.DefinitionPatch, db: sqlite3.Connection = Depends(get_db), user: sqlite3.Row = Depends(get_current_user)):
    return tag_maintenance.update_definition(db, user["id"], definition_id, payload)


@router.post("/api/v1/my/review-tags/bulk")
def tag_bulk(payload: tag_maintenance.BulkTags, db: sqlite3.Connection = Depends(get_db), user: sqlite3.Row = Depends(get_current_user)):
    return tag_maintenance.bulk_tags(db, user["id"], payload)


@router.post("/api/v1/my/review-tags/change-preview")
def tag_change_preview(payload: tag_maintenance.TagChange,
                       db: sqlite3.Connection = Depends(get_db), user: sqlite3.Row = Depends(get_current_user)):
    return tag_maintenance.preview(db, user["id"], payload)


@router.post("/api/v1/my/review-tags/change")
def tag_change_apply(payload: tag_maintenance.TagApply,
                     db: sqlite3.Connection = Depends(get_db), user: sqlite3.Row = Depends(get_current_user)):
    return tag_maintenance.apply(db, user["id"], payload)


@router.get("/api/v1/my/review-tags")
def review_tags(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                account_id: int | None = Query(None, ge=1), q: str | None = Query(None, max_length=40),
                db: sqlite3.Connection = Depends(get_db), user: sqlite3.Row = Depends(get_current_user)):
    return reviews.list_tags(db, user["id"], page, page_size, account_id, q)


@router.get("/api/v1/my/reviews")
def review_list(page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100),
                account_id: int | None = Query(None, ge=1),
                status: Literal["draft", "reviewed"] | None = None,
                tag: str | None = Query(None, max_length=40),
                q: str | None = Query(None, max_length=200),
                association: Literal["linked", "orphan"] | None = None,
                emotion: Emotion | None = None, primary_error: ErrorCode | None = None,
                db: sqlite3.Connection = Depends(get_db), user: sqlite3.Row = Depends(get_current_user)):
    return reviews.list_reviews(db, user["id"], page, page_size, account_id, status, tag, q, association, emotion, primary_error)


@router.get("/api/v1/my/trades/{trade_id}/review")
def review_get(trade_id: int, db: sqlite3.Connection = Depends(get_db), user: sqlite3.Row = Depends(get_current_user)):
    return reviews.get_review(db, user["id"], trade_id)


@router.put("/api/v1/my/trades/{trade_id}/review")
def review_put(trade_id: int, payload: reviews.ReviewInput, db: sqlite3.Connection = Depends(get_db), user: sqlite3.Row = Depends(get_current_user)):
    return reviews.save_review(db, user["id"], trade_id, payload)


@router.get("/api/v1/my/trades/{trade_id}/review/versions")
def review_versions(trade_id: int, page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=50),
                    db: sqlite3.Connection = Depends(get_db), user: sqlite3.Row = Depends(get_current_user)):
    return reviews.list_versions(db, user["id"], trade_id, page, page_size)


@router.get("/api/v1/my/performance")
def performance(account_id: int, start_date: date, end_date: date,
                symbol: str | None = Query(None, max_length=64),
                direction: str | None = Query(None, pattern="^(buy|sell)$"),
                tag: str | None = Query(None, max_length=40),
                review_status: Literal["unwritten", "draft", "reviewed"] | None = None,
                setup_id: int | None = Query(None, ge=1),
                execution_status: Literal["unrated", "compliant", "violations", "insufficient"] | None = None,
                db: sqlite3.Connection = Depends(get_db), user: sqlite3.Row = Depends(get_current_user)):
    from .analytics import report
    return report(db, user["id"], account_id, start_date, end_date, symbol, direction, tag, review_status, setup_id, execution_status)


@router.get("/api/v1/my/performance/export")
def performance_export(account_id: int, start_date: date, end_date: date,
                symbol: str | None = Query(None, max_length=64),
                direction: str | None = Query(None, pattern="^(buy|sell)$"),
                tag: str | None = Query(None, max_length=40),
                review_status: Literal["unwritten", "draft", "reviewed"] | None = None,
                setup_id: int | None = Query(None, ge=1),
                execution_status: Literal["unrated", "compliant", "violations", "insufficient"] | None = None,
                db: sqlite3.Connection = Depends(get_db), user: sqlite3.Row = Depends(get_current_user)):
    from .analytics import report
    data = report(db, user["id"], account_id, start_date, end_date, symbol, direction, tag, review_status, setup_id, execution_status)
    output = io.StringIO(newline="")
    output.write("\ufeff")
    writer = csv.writer(output)
    writer.writerow(["平仓日期", "交易编号", "品种", "方向", "净收益", "币种", "统计开始", "统计结束"])
    for day in data["days"]:
        for trade in day["trades"]:
            writer.writerow([day["date"], trade["trade_id"], trade["symbol"], "做多" if trade["direction"] == "buy" else "做空",
                             trade["net_pnl"], data["currency"] or "未设置", str(data["start_date"]), str(data["end_date"])])
    filename = f"TradeEZ-performance-{start_date}-{end_date}.csv"
    return Response(output.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/api/v1/my/trades/{trade_id}", response_model=TradeDetailOut)
def trade_detail(trade_id: int, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
                 db: sqlite3.Connection = Depends(get_db), user: sqlite3.Row = Depends(get_current_user)):
    projection.refresh(db, user["id"])
    db.execute("BEGIN")
    try:
        row = db.execute("SELECT t.*" + projection.REVIEW_COLUMNS + " FROM trade_lifecycles t JOIN accounts a ON a.id=t.account_id" +
                         projection.REVIEW_JOIN + " WHERE t.id=? AND a.user_id=?", (trade_id, user["id"])).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Trade not found or superseded by source correction")
        total = db.execute("SELECT COUNT(*) FROM trade_allocations WHERE trade_id=?", (trade_id,)).fetchone()[0]
        refs = db.execute("SELECT * FROM trade_allocations WHERE trade_id=? ORDER BY deal_ticket,role LIMIT ? OFFSET ?",
                          (trade_id, page_size, (page - 1) * page_size)).fetchall()
        result = TradeDetailOut(trade=projection.trade_out(row, db),
                                allocations=[TradeAllocationOut.model_validate(dict(ref)) for ref in refs],
                                total=total, page=page, page_size=page_size)
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


@router.get("/api/v1/my/trades/{trade_id}/reconciliation")
def reconciliation_get(trade_id: int, db: sqlite3.Connection = Depends(get_db), user: sqlite3.Row = Depends(get_current_user)):
    return reconciliation.get_case(db, user["id"], trade_id)


@router.put("/api/v1/my/trades/{trade_id}/reconciliation")
def reconciliation_put(trade_id: int, payload: reconciliation.ReconciliationUpdate,
                       db: sqlite3.Connection = Depends(get_db), user: sqlite3.Row = Depends(get_current_user)):
    return reconciliation.update_case(db, user["id"], trade_id, payload)

@router.get("/api/v1/my/orders", response_model=OrderPageOut)
def my_orders(
    account_id: int | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    symbol: str | None = Query(default=None, max_length=64),
    direction: str | None = Query(default=None, pattern="^(buy|sell|mixed|unknown)$"),
    status_filter: str | None = Query(default=None, alias="status", pattern="^(open|closed|needs_review)$"),
    review_status: Literal["unwritten", "draft", "reviewed"] | None = None,
    reconciliation_case: Literal["untracked", "open", "investigating", "resolved"] | None = None,
    start_time: int | None = Query(default=None, ge=0),
    end_time: int | None = Query(default=None, ge=0),
    sort: str = Query("open_time_desc", pattern="^(open_time_desc|open_time_asc|close_time_desc|close_time_asc)$"),
    db: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(get_current_user),
) -> OrderPageOut:
    return service.my_orders(account_id, page, page_size, symbol, direction, status_filter, start_time, end_time, sort, db, user, review_status, reconciliation_case)


@router.get("/api/v1/my/accounts/{account_id}/positions", response_model=list[PositionOut])
def my_account_positions(
    account_id: int,
    include_closed: bool = True,
    db: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(get_current_user),
) -> list[PositionOut]:
    return service.my_account_positions(account_id, include_closed, db, user)
