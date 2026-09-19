from app.db import DBConnection
import hashlib
import json
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..db import get_db
from ..security import get_current_user
from ..trades import projection

router = APIRouter(prefix="/api/v1/my", tags=["daily-reviews"])


class DailyReviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expected_revision: int = Field(ge=0, strict=True)
    account_id: int = Field(gt=0, strict=True)
    review_date: date
    timezone: str = Field(default="Asia/Shanghai", max_length=64)
    plan_difference: str = Field(default="", max_length=2000)
    execution_review: str = Field(default="", max_length=2000)
    keep_behavior: str = Field(default="", max_length=1000)
    main_problem: str = Field(default="", max_length=1000)
    next_action: str = Field(default="", max_length=1000)
    no_new_action: bool = Field(default=False, strict=True)
    data_reviewed: bool = Field(default=False, strict=True)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        try: ZoneInfo(value)
        except ZoneInfoNotFoundError: raise ValueError("请输入有效 IANA 时区")
        return value

    @model_validator(mode="after")
    def action_choice(self):
        if self.no_new_action and self.next_action: raise ValueError("继续现有行动时不能同时填写新行动")
        return self


def bounds(day, zone_name):
    zone = ZoneInfo(zone_name); start = datetime.combine(day, datetime.min.time(), zone).astimezone(timezone.utc)
    return int(start.timestamp()), int((start + timedelta(days=1)).timestamp())


def current_summary(db, user_id, account_id, day, zone_name):
    projection.refresh(db, user_id); start, end = bounds(day, zone_name)
    deals = db.execute("SELECT COUNT(*) FROM deals d JOIN accounts a ON a.mt5_login=d.account_login WHERE a.id=? AND a.user_id=? AND d.deal_time>=? AND d.deal_time<?", (account_id, user_id, start, end)).fetchone()[0]
    trades = db.execute("""SELECT t.id,t.status,json_extract(t.payload_json,'$.net_pnl') AS net_pnl,r.status AS review_status,
        re.compliance,su.id AS setup_id FROM trade_lifecycles t LEFT JOIN trade_reviews r ON r.account_id=t.account_id AND r.position_id=t.position_id AND r.anchor_ticket=t.anchor_ticket
        LEFT JOIN review_evaluations re ON re.review_id=r.id LEFT JOIN playbook_versions pv ON pv.id=re.playbook_version_id LEFT JOIN setups su ON su.id=pv.setup_id
        WHERE t.account_id=? AND t.close_time>=? AND t.close_time<? ORDER BY t.id""", (account_id, start, end)).fetchall()
    day_plan_ids = "SELECT id FROM day_plans WHERE user_id=? AND account_id=? AND plan_date=?"
    intention_start = datetime.fromtimestamp(start, timezone.utc).isoformat().replace("+00:00", "Z")
    intention_end = datetime.fromtimestamp(end, timezone.utc).isoformat().replace("+00:00", "Z")
    intentions = db.execute(f"""SELECT COUNT(*),SUM(CASE WHEN linked_trade_id IS NOT NULL THEN 1 ELSE 0 END)
        FROM trade_intentions WHERE account_id=? AND user_id=? AND (
            day_plan_id IN ({day_plan_ids}) OR (created_at>=? AND created_at<?)
        )""", (account_id, user_id, user_id, account_id, day.isoformat(), intention_start, intention_end)).fetchone()
    complete = [row for row in trades if row["status"] == "complete"]
    return dict(deal_count=deals, closed_trades=len(complete), needs_review=sum(row["status"] != "complete" for row in trades),
                net_pnl=round(sum(float(row["net_pnl"] or 0) for row in complete), 8),
                reviewed=sum(row["review_status"] == "reviewed" for row in complete),
                pending_reviews=sum(row["review_status"] != "reviewed" for row in complete),
                setup_linked=sum(row["setup_id"] is not None for row in complete),
                violations=sum(row["compliance"] == "violations" for row in complete),
                intentions=intentions[0], linked_intentions=intentions[1] or 0,
                trade_ids=[row["id"] for row in trades])


def digest(summary): return hashlib.sha256(json.dumps(summary, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def review_out(row, current):
    answers = json.loads(row["answers_json"]) if row else dict(plan_difference="", execution_review="", keep_behavior="",
        main_problem="", next_action="", no_new_action=False, data_reviewed=False)
    return dict(id=row["id"] if row else None, account_id=row["account_id"] if row else None,
                review_date=row["review_date"] if row else None, timezone=row["timezone"] if row else "Asia/Shanghai",
                status=("needs_review" if row and row["status"] == "completed" and row["source_hash"] != digest(current) else row["status"] if row else "draft"),
                revision=row["revision"] if row else 0, **answers, saved_summary=json.loads(row["summary_json"]) if row else None,
                current_summary=current, source_changed=bool(row and row["source_hash"] != digest(current)),
                first_completed_at=row["first_completed_at"] if row else None, completed_at=row["completed_at"] if row else None,
                updated_at=row["updated_at"] if row else None)


@router.get("/daily-review")
def get_daily_review(account_id: int = Query(gt=0), review_date: date = Query(), timezone_name: str = Query("Asia/Shanghai", alias="timezone"), db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    if db.execute("SELECT 1 FROM accounts WHERE id=? AND user_id=?", (account_id, user["id"])).fetchone() is None: raise HTTPException(404, "账户不存在")
    try: ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError: raise HTTPException(422, "无效时区")
    current = current_summary(db, user["id"], account_id, review_date, timezone_name)
    row = db.execute("SELECT * FROM daily_reviews WHERE user_id=? AND account_id=? AND review_date=?", (user["id"], account_id, review_date.isoformat())).fetchone()
    return review_out(row, current)


@router.put("/daily-review")
def save_daily_review(payload: DailyReviewInput, complete: bool = Query(False), db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    if db.execute("SELECT 1 FROM accounts WHERE id=? AND user_id=?", (payload.account_id, user["id"])).fetchone() is None: raise HTTPException(404, "账户不存在")
    if complete and (not payload.data_reviewed or not all((payload.plan_difference, payload.execution_review, payload.keep_behavior, payload.main_problem)) or not (payload.next_action or payload.no_new_action)):
        raise HTTPException(400, "提交日总结前请核对汇总、回答必答问题并明确下一步行动")
    current = current_summary(db, user["id"], payload.account_id, payload.review_date, payload.timezone); source_hash = digest(current)
    answers = payload.model_dump(mode="json", exclude={"expected_revision", "account_id", "review_date", "timezone"})
    db.execute("BEGIN IMMEDIATE")
    try:
        old = db.execute("SELECT * FROM daily_reviews WHERE user_id=? AND account_id=? AND review_date=?", (user["id"], payload.account_id, payload.review_date.isoformat())).fetchone()
        if (old["revision"] if old else 0) != payload.expected_revision: raise HTTPException(409, "日总结已在其他窗口修改，请重新加载")
        revision = (old["revision"] if old else 0) + 1; status = "completed" if complete else "draft"
        db.execute("""INSERT INTO daily_reviews(user_id,account_id,review_date,timezone,status,answers_json,summary_json,source_hash,revision,first_completed_at,completed_at)
            VALUES(?,?,?,?,?,?,?,?,?,CASE WHEN ?='completed' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') END,CASE WHEN ?='completed' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') END)
            ON CONFLICT(user_id,account_id,review_date) DO UPDATE SET timezone=excluded.timezone,status=excluded.status,answers_json=excluded.answers_json,
            summary_json=excluded.summary_json,source_hash=excluded.source_hash,revision=excluded.revision,
            first_completed_at=COALESCE(daily_reviews.first_completed_at,excluded.first_completed_at),completed_at=excluded.completed_at,
            updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')""", (user["id"], payload.account_id, payload.review_date.isoformat(), payload.timezone, status,
            json.dumps(answers, ensure_ascii=False), json.dumps(current, ensure_ascii=False), source_hash, revision, status, status))
        saved = db.execute("SELECT * FROM daily_reviews WHERE user_id=? AND account_id=? AND review_date=?", (user["id"], payload.account_id, payload.review_date.isoformat())).fetchone()
        db.execute("INSERT INTO daily_review_versions(review_id,revision,status,answers_json,summary_json,source_hash) VALUES(?,?,?,?,?,?)",
                   (saved["id"], revision, status, saved["answers_json"], saved["summary_json"], source_hash))
        db.commit(); return review_out(saved, current)
    except Exception:
        db.rollback(); raise
