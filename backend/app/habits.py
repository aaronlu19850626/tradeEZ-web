from app.db import DBConnection
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from .db import get_db
from .security import get_current_user

router = APIRouter(prefix="/api/v1/my", tags=["habits-reminders"])


class ReminderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=300)
    due_at: datetime | None = None


class ReminderPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1, strict=True)
    status: str = Field(pattern="^(open|done|snoozed)$")
    snoozed_until: datetime | None = None


def percentage(done, total): return round(done / total * 100, 1) if total else None


@router.get("/habit-summary")
def habit_summary(start_date: date, end_date: date, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    if end_date < start_date or (end_date - start_date).days > 366: raise HTTPException(400, "日期范围无效或超过 366 天")
    days = (end_date - start_date).days + 1
    plans = db.execute("SELECT COUNT(*),SUM(status='confirmed') FROM day_plans WHERE user_id=? AND plan_date>=? AND plan_date<=?", (user["id"], start_date.isoformat(), end_date.isoformat())).fetchone()
    reviews = db.execute("SELECT COUNT(*),SUM(status='completed') FROM daily_reviews WHERE user_id=? AND review_date>=? AND review_date<=?", (user["id"], start_date.isoformat(), end_date.isoformat())).fetchone()
    trades = db.execute("""SELECT COUNT(*),SUM(CASE WHEN r.status='reviewed' THEN 1 ELSE 0 END)
        FROM trade_lifecycles t JOIN accounts a ON a.id=t.account_id LEFT JOIN trade_reviews r
        ON r.account_id=t.account_id AND r.position_id=t.position_id AND r.anchor_ticket=t.anchor_ticket
        WHERE a.user_id=? AND t.status='complete' AND date(t.close_time,'unixepoch')>=? AND date(t.close_time,'unixepoch')<=?""", (user["id"], start_date.isoformat(), end_date.isoformat())).fetchone()
    plan_done, review_done, trade_done = int(plans[1] or 0), int(reviews[1] or 0), int(trades[1] or 0)
    return dict(start_date=start_date, end_date=end_date, calendar_days=days,
                plans=dict(recorded=plans[0], confirmed=plan_done, rate=percentage(plan_done, days)),
                daily_reviews=dict(recorded=reviews[0], completed=review_done, rate=percentage(review_done, days)),
                trade_reviews=dict(total=trades[0], completed=trade_done, rate=percentage(trade_done, trades[0])))


def out(row): return dict(row)


@router.get("/reminders")
def list_reminders(status: str | None = Query(None, pattern="^(open|done|snoozed)$"), db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    params = (user["id"], status) if status else (user["id"],)
    rows = db.execute("SELECT * FROM reminders WHERE user_id=?" + (" AND status=?" if status else "") + " ORDER BY status='open' DESC,due_at IS NULL,due_at,id DESC", params).fetchall()
    return [out(row) for row in rows]


@router.post("/reminders", status_code=201)
def create_reminder(payload: ReminderCreate, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    due = payload.due_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if payload.due_at else None
    cursor = db.execute("INSERT INTO reminders(user_id,title,due_at) VALUES(?,?,?)", (user["id"], payload.title, due))
    return out(db.execute("SELECT * FROM reminders WHERE id=?", (cursor.lastrowid,)).fetchone())


@router.patch("/reminders/{reminder_id}")
def update_reminder(reminder_id: int, payload: ReminderPatch, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    row = db.execute("SELECT * FROM reminders WHERE id=? AND user_id=?", (reminder_id, user["id"])).fetchone()
    if row is None: raise HTTPException(404, "提醒不存在")
    if row["revision"] != payload.expected_revision: raise HTTPException(409, "提醒已被修改，请重新加载")
    if payload.status == "snoozed" and payload.snoozed_until is None: raise HTTPException(400, "稍后处理需要新的提醒时间")
    snoozed = payload.snoozed_until.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if payload.snoozed_until else None
    db.execute("UPDATE reminders SET status=?,snoozed_until=?,due_at=CASE WHEN ?='snoozed' THEN ? ELSE due_at END,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", (payload.status, snoozed, payload.status, snoozed, reminder_id))
    return out(db.execute("SELECT * FROM reminders WHERE id=?", (reminder_id,)).fetchone())
