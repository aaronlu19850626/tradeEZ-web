from app.db import DBConnection
import json
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..db import get_db
from ..security import get_current_user
from ..trades import projection

router = APIRouter(prefix="/api/v1/my", tags=["planning"])


class Scenario(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,39}$")
    name: str = Field(min_length=1, max_length=100)
    symbol: str = Field(min_length=1, max_length=40)
    direction: Literal["buy", "sell", "neutral"]
    playbook_version_id: int | None = Field(default=None, gt=0)
    area: str = Field(default="", max_length=500)
    confirmation: str = Field(default="", max_length=1000)
    invalidation: str = Field(default="", max_length=1000)
    exit_principle: str = Field(default="", max_length=1000)
    session: str = Field(default="", max_length=100)


class PlanInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expected_revision: int = Field(ge=0, strict=True)
    account_id: int = Field(gt=0, strict=True)
    plan_date: date
    timezone: str = Field(default="Asia/Shanghai", max_length=64)
    mode: Literal["trade", "observe", "rest"]
    self_state: str = Field(default="", max_length=1000)
    market_view: str = Field(default="", max_length=2000)
    events: str = Field(default="", max_length=2000)
    risk_limit: str = Field(default="", max_length=1000)
    stop_conditions: str = Field(default="", max_length=1000)
    improvement_focus: str = Field(default="", max_length=1000)
    waiting_condition: str = Field(default="", max_length=1000)
    no_trade_reason: str = Field(default="", max_length=1000)
    allowed_playbook_version_ids: list[int] = Field(default_factory=list, max_length=30)
    scenarios: list[Scenario] = Field(default_factory=list, max_length=20)
    change_reason: str = Field(default="", max_length=500)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        try: ZoneInfo(value)
        except ZoneInfoNotFoundError: raise ValueError("请输入有效 IANA 时区")
        return value

    @model_validator(mode="after")
    def consistent(self):
        if self.mode == "trade" and not (self.scenarios or self.waiting_condition):
            raise ValueError("准备交易时请至少填写一个场景或明确等待条件")
        if self.mode != "trade" and not self.no_trade_reason:
            raise ValueError("仅观察或休息时请填写原因")
        if len({item.id for item in self.scenarios}) != len(self.scenarios):
            raise ValueError("场景标识不能重复")
        return self


def content(payload):
    return {key: value for key, value in payload.model_dump(mode="json").items()
            if key not in ("expected_revision", "account_id", "plan_date", "timezone", "mode", "change_reason")}


def plan_out(row):
    if row is None: return None
    return dict(id=row["id"], account_id=row["account_id"], plan_date=row["plan_date"], timezone=row["timezone"],
                mode=row["mode"], status=row["status"], revision=row["revision"], **json.loads(row["content_json"]),
                first_confirmed_at=row["first_confirmed_at"], confirmed_at=row["confirmed_at"],
                confirmed_late=bool(row["confirmed_late"]), updated_at=row["updated_at"])


def account_owned(db, user_id, account_id):
    if db.execute("SELECT 1 FROM accounts WHERE id=? AND user_id=?", (account_id, user_id)).fetchone() is None:
        raise HTTPException(404, "账户不存在")


def validate_playbooks(db, user_id, ids):
    if not ids: return
    placeholders = ",".join("?" for _ in ids)
    count = db.execute(f"""SELECT COUNT(*) FROM playbook_versions v JOIN setups s ON s.id=v.setup_id
        WHERE v.id IN ({placeholders}) AND s.user_id=? AND s.status='active' AND v.status='published'""", [*set(ids), user_id]).fetchone()[0]
    if count != len(set(ids)): raise HTTPException(400, "计划包含不存在、未发布或已停用的 Playbook")


@router.get("/day-plan")
def get_plan(account_id: int = Query(gt=0), plan_date: date = Query(), db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    account_owned(db, user["id"], account_id)
    return plan_out(db.execute("SELECT * FROM day_plans WHERE user_id=? AND account_id=? AND plan_date=?", (user["id"], account_id, plan_date.isoformat())).fetchone())


@router.put("/day-plan")
def save_plan(payload: PlanInput, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    account_owned(db, user["id"], payload.account_id)
    ids = list(dict.fromkeys(payload.allowed_playbook_version_ids + [s.playbook_version_id for s in payload.scenarios if s.playbook_version_id]))
    validate_playbooks(db, user["id"], ids)
    db.execute("BEGIN IMMEDIATE")
    try:
        old = db.execute("SELECT * FROM day_plans WHERE user_id=? AND account_id=? AND plan_date=?", (user["id"], payload.account_id, payload.plan_date.isoformat())).fetchone()
        if (old["revision"] if old else 0) != payload.expected_revision: raise HTTPException(409, "日计划已在其他窗口修改，请重新加载")
        if old and old["status"] == "confirmed" and not payload.change_reason: raise HTTPException(400, "修改已确认计划时请填写修订原因")
        next_revision = (old["revision"] if old else 0) + 1; body = json.dumps(content(payload), ensure_ascii=False)
        db.execute("""INSERT INTO day_plans(user_id,account_id,plan_date,timezone,mode,status,content_json,revision)
            VALUES(?,?,?,?,?,'draft',?,?) ON CONFLICT(user_id,account_id,plan_date) DO UPDATE SET timezone=excluded.timezone,
            mode=excluded.mode,status='draft',content_json=excluded.content_json,revision=excluded.revision,
            updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')""", (user["id"], payload.account_id, payload.plan_date.isoformat(), payload.timezone, payload.mode, body, next_revision))
        saved = db.execute("SELECT * FROM day_plans WHERE user_id=? AND account_id=? AND plan_date=?", (user["id"], payload.account_id, payload.plan_date.isoformat())).fetchone()
        db.execute("INSERT INTO day_plan_versions(plan_id,revision,mode,status,content_json,change_reason) VALUES(?,?,?,'draft',?,?)",
                   (saved["id"], next_revision, payload.mode, body, payload.change_reason))
        db.commit(); return plan_out(saved)
    except Exception:
        db.rollback(); raise


@router.post("/day-plans/{plan_id}/confirm")
def confirm_plan(plan_id: int, expected_revision: int = Query(ge=1), db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    projection.refresh(db, user["id"])
    db.execute("BEGIN IMMEDIATE")
    try:
        row = db.execute("SELECT * FROM day_plans WHERE id=? AND user_id=?", (plan_id, user["id"])).fetchone()
        if row is None: raise HTTPException(404, "日计划不存在")
        if row["revision"] != expected_revision: raise HTTPException(409, "计划已修改，请重新确认")
        body = json.loads(row["content_json"])
        if row["mode"] == "trade" and (not body.get("allowed_playbook_version_ids") or not body.get("stop_conditions")):
            raise HTTPException(400, "确认准备交易计划前，请选择允许模型并填写停止条件")
        zone = ZoneInfo(row["timezone"]); start = datetime.combine(date.fromisoformat(row["plan_date"]), datetime.min.time(), zone).astimezone(timezone.utc)
        end = start + timedelta(days=1); now = datetime.now(timezone.utc)
        first_trade = db.execute("SELECT MIN(open_time) FROM trade_lifecycles WHERE account_id=? AND open_time>=? AND open_time<?", (row["account_id"], int(start.timestamp()), int(end.timestamp()))).fetchone()[0]
        late = bool(first_trade and first_trade < int(now.timestamp()))
        db.execute("""UPDATE day_plans SET status='confirmed',first_confirmed_at=COALESCE(first_confirmed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            confirmed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),confirmed_late=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?""", (int(late), plan_id))
        db.execute("UPDATE day_plan_versions SET status='confirmed' WHERE plan_id=? AND revision=?", (plan_id, row["revision"]))
        saved = db.execute("SELECT * FROM day_plans WHERE id=?", (plan_id,)).fetchone(); db.commit(); return plan_out(saved)
    except Exception:
        db.rollback(); raise
