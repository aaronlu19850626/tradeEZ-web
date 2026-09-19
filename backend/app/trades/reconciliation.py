from app.db import DBConnection
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field, model_validator


class ReconciliationUpdate(BaseModel):
    state: Literal["open", "investigating", "resolved"]
    resolution: Literal["source_confirmed", "awaiting_resync", "not_a_trade"] | None = None
    note: str = Field(min_length=3, max_length=1000)

    @model_validator(mode="after")
    def validate_resolution(self):
        if self.state == "resolved" and self.resolution is None:
            raise ValueError("解决异常时必须选择处理结论")
        if self.state == "open" and self.resolution is not None:
            raise ValueError("待处理状态不能提前设置处理结论")
        if self.state == "investigating" and self.resolution not in (None, "awaiting_resync"):
            raise ValueError("核对中仅可标记为等待EA补传")
        return self


def _trade(db: DBConnection, user_id: int, trade_id: int):
    row = db.execute("""SELECT t.* FROM trade_lifecycles t JOIN accounts a ON a.id=t.account_id
        WHERE t.id=? AND a.user_id=?""", (trade_id, user_id)).fetchone()
    if row is None:
        raise HTTPException(404, "Trade not found")
    return row


def get_case(db: DBConnection, user_id: int, trade_id: int):
    trade = _trade(db, user_id, trade_id)
    case = db.execute("""SELECT * FROM trade_reconciliation_cases
        WHERE user_id=? AND account_id=? AND position_id=? AND anchor_ticket=?""",
        (user_id, trade["account_id"], str(trade["position_id"]), str(trade["anchor_ticket"]))).fetchone()
    if case is None:
        return {"state": "open", "resolution": None, "note": "", "updated_at": None, "events": []}
    events = db.execute("SELECT state,resolution,note,created_at FROM trade_reconciliation_events WHERE case_id=? ORDER BY id DESC",
                        (case["id"],)).fetchall()
    return {"state": case["state"], "resolution": case["resolution"], "note": case["note"],
            "updated_at": case["updated_at"], "events": [dict(row) for row in events]}


def update_case(db: DBConnection, user_id: int, trade_id: int, payload: ReconciliationUpdate):
    trade = _trade(db, user_id, trade_id)
    if trade["status"] != "needs_review" and payload.state != "resolved":
        raise HTTPException(409, "Only trades requiring review can open a reconciliation case")
    values = (user_id, trade["account_id"], str(trade["position_id"]), str(trade["anchor_ticket"]),
              payload.state, payload.resolution, payload.note.strip())
    db.execute("BEGIN IMMEDIATE")
    try:
        db.execute("""INSERT INTO trade_reconciliation_cases
            (user_id,account_id,position_id,anchor_ticket,state,resolution,note) VALUES(?,?,?,?,?,?,?)
            ON CONFLICT(user_id,account_id,position_id,anchor_ticket) DO UPDATE SET
            state=excluded.state,resolution=excluded.resolution,note=excluded.note,
            updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')""", values)
        case_id = db.execute("""SELECT id FROM trade_reconciliation_cases
            WHERE user_id=? AND account_id=? AND position_id=? AND anchor_ticket=?""", values[:4]).fetchone()[0]
        db.execute("INSERT INTO trade_reconciliation_events(case_id,state,resolution,note) VALUES(?,?,?,?)",
                   (case_id, payload.state, payload.resolution, payload.note.strip()))
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_case(db, user_id, trade_id)
