from app.db import DBConnection
import hashlib
import json
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .db import get_db
from .security import get_current_user

router = APIRouter(prefix="/api/v1/my", tags=["weekly-reviews"])


class WeeklyInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expected_revision: int = Field(ge=0, strict=True)
    week_start: date
    achievements: str = Field(default="", max_length=2000)
    recurring_problems: str = Field(default="", max_length=2000)
    next_focus: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def monday(self):
        if self.week_start.weekday() != 0: raise ValueError("周起始日期必须是星期一")
        return self


class ActionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    weekly_review_id: int | None = Field(default=None, gt=0, strict=True)
    title: str = Field(min_length=1, max_length=300)
    success_measure: str = Field(default="", max_length=1000)
    target_date: date | None = None


class ActionPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expected_revision: int = Field(ge=1, strict=True)
    status: str = Field(pattern="^(active|completed|abandoned)$")
    outcome: str = Field(default="", max_length=1000)


def summary(db, user_id, start):
    end = start + timedelta(days=7)
    rows = db.execute("""SELECT status,summary_json FROM daily_reviews
        WHERE user_id=? AND review_date>=? AND review_date<? ORDER BY review_date""",
        (user_id, start.isoformat(), end.isoformat())).fetchall()
    totals = dict(days_recorded=len(rows), days_completed=sum(r["status"] == "completed" for r in rows),
                  closed_trades=0, reviewed=0, pending_reviews=0, net_pnl=0.0, violations=0)
    for row in rows:
        item = json.loads(row["summary_json"])
        for key in ("closed_trades", "reviewed", "pending_reviews", "violations"): totals[key] += int(item.get(key, 0))
        totals["net_pnl"] += float(item.get("net_pnl", 0))
    totals["net_pnl"] = round(totals["net_pnl"], 8)
    return totals


def review_out(row, current):
    answers = json.loads(row["answers_json"]) if row else dict(achievements="", recurring_problems="", next_focus="")
    changed = bool(row and row["source_hash"] != hashlib.sha256(json.dumps(current, sort_keys=True).encode()).hexdigest())
    return dict(id=row["id"] if row else None, week_start=row["week_start"] if row else None,
                status=("needs_review" if row and row["status"] == "completed" and changed else row["status"] if row else "draft"),
                revision=row["revision"] if row else 0, **answers, current_summary=current,
                saved_summary=json.loads(row["summary_json"]) if row else None, source_changed=changed,
                completed_at=row["completed_at"] if row else None, updated_at=row["updated_at"] if row else None)


@router.get("/weekly-review")
def get_weekly_review(week_start: date = Query(), db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    if week_start.weekday() != 0: raise HTTPException(400, "周起始日期必须是星期一")
    current = summary(db, user["id"], week_start)
    row = db.execute("SELECT * FROM weekly_reviews WHERE user_id=? AND week_start=?", (user["id"], week_start.isoformat())).fetchone()
    return review_out(row, current)


@router.put("/weekly-review")
def save_weekly_review(payload: WeeklyInput, complete: bool = Query(False), db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    if complete and not all((payload.achievements, payload.recurring_problems, payload.next_focus)):
        raise HTTPException(400, "提交周复盘前请完成三项总结")
    current = summary(db, user["id"], payload.week_start); digest = hashlib.sha256(json.dumps(current, sort_keys=True).encode()).hexdigest()
    answers = json.dumps(payload.model_dump(mode="json", exclude={"expected_revision", "week_start"}), ensure_ascii=False)
    db.execute("BEGIN IMMEDIATE")
    try:
        old = db.execute("SELECT * FROM weekly_reviews WHERE user_id=? AND week_start=?", (user["id"], payload.week_start.isoformat())).fetchone()
        if (old["revision"] if old else 0) != payload.expected_revision: raise HTTPException(409, "周复盘已在其他窗口修改，请重新加载")
        revision = (old["revision"] if old else 0) + 1; status = "completed" if complete else "draft"
        db.execute("""INSERT INTO weekly_reviews(user_id,week_start,status,answers_json,summary_json,source_hash,revision,completed_at)
            VALUES(?,?,?,?,?,?,?,CASE WHEN ?='completed' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') END)
            ON CONFLICT(user_id,week_start) DO UPDATE SET status=excluded.status,answers_json=excluded.answers_json,
            summary_json=excluded.summary_json,source_hash=excluded.source_hash,revision=excluded.revision,
            completed_at=excluded.completed_at,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')""",
            (user["id"], payload.week_start.isoformat(), status, answers, json.dumps(current), digest, revision, status))
        saved = db.execute("SELECT * FROM weekly_reviews WHERE user_id=? AND week_start=?", (user["id"], payload.week_start.isoformat())).fetchone()
        db.commit(); return review_out(saved, current)
    except Exception: db.rollback(); raise


def action_out(row): return dict(row)


@router.get("/improvement-actions")
def list_actions(status: str | None = Query(None, pattern="^(active|completed|abandoned)$"), db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    rows = db.execute("SELECT * FROM improvement_actions WHERE user_id=?" + (" AND status=?" if status else "") + " ORDER BY status='active' DESC,target_date IS NULL,target_date,id DESC", (user["id"], status) if status else (user["id"],)).fetchall()
    return [action_out(row) for row in rows]


@router.post("/improvement-actions", status_code=201)
def create_action(payload: ActionCreate, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    if payload.weekly_review_id and db.execute("SELECT 1 FROM weekly_reviews WHERE id=? AND user_id=?", (payload.weekly_review_id, user["id"])).fetchone() is None: raise HTTPException(404, "周复盘不存在")
    cursor = db.execute("INSERT INTO improvement_actions(user_id,weekly_review_id,title,success_measure,target_date) VALUES(?,?,?,?,?)", (user["id"], payload.weekly_review_id, payload.title, payload.success_measure, payload.target_date.isoformat() if payload.target_date else None))
    return action_out(db.execute("SELECT * FROM improvement_actions WHERE id=?", (cursor.lastrowid,)).fetchone())


@router.patch("/improvement-actions/{action_id}")
def update_action(action_id: int, payload: ActionPatch, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    row = db.execute("SELECT * FROM improvement_actions WHERE id=? AND user_id=?", (action_id, user["id"])).fetchone()
    if row is None: raise HTTPException(404, "行动不存在")
    if row["revision"] != payload.expected_revision: raise HTTPException(409, "行动已被修改，请重新加载")
    if payload.status != "active" and not payload.outcome: raise HTTPException(400, "完成或放弃行动时请填写结果说明")
    db.execute("UPDATE improvement_actions SET status=?,outcome=?,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", (payload.status, payload.outcome, action_id))
    return action_out(db.execute("SELECT * FROM improvement_actions WHERE id=?", (action_id,)).fetchone())
