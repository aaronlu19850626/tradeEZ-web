import psycopg
from app.db import DBConnection
import json
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..db import get_db
from ..security import get_current_user
from ..trades import projection

router = APIRouter(prefix="/api/v1/my", tags=["intentions"])
State = Literal["watching", "prepared", "executed_unlinked", "linked", "abandoned", "invalidated", "expired"]


class IntentionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    account_id: int = Field(gt=0, strict=True)
    day_plan_id: int | None = Field(default=None, gt=0)
    scenario_id: str | None = Field(default=None, max_length=40)
    playbook_version_id: int | None = Field(default=None, gt=0)
    symbol: str = Field(min_length=1, max_length=40)
    direction: Literal["buy", "sell"]
    state: Literal["watching", "prepared"] = "watching"
    entry_basis: str = Field(default="", max_length=2000)
    risk_plan: str = Field(default="", max_length=1000)

    @field_validator("symbol")
    @classmethod
    def upper_symbol(cls, value): return value.upper()


class Transition(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    state: State
    reason: str = Field(default="", max_length=1000)


class LinkInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    trade_id: int = Field(gt=0, strict=True)


def owned_account(db, user_id, account_id):
    if db.execute("SELECT 1 FROM accounts WHERE id=? AND user_id=?", (account_id, user_id)).fetchone() is None:
        raise HTTPException(404, "账户不存在")


def owned_intention(db, user_id, intention_id):
    row = db.execute("SELECT * FROM trade_intentions WHERE id=? AND user_id=?", (intention_id, user_id)).fetchone()
    if row is None: raise HTTPException(404, "交易意图不存在")
    return row


def out(db, row):
    events = [dict(item) for item in db.execute("SELECT * FROM intention_events WHERE intention_id=? ORDER BY id", (row["id"],))]
    return dict(**dict(row), events=events)


@router.get("/intentions")
def list_intentions(account_id: int = Query(gt=0), plan_date: date = Query(), db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    owned_account(db, user["id"], account_id); projection.refresh(db, user["id"])
    plan = db.execute("SELECT * FROM day_plans WHERE user_id=? AND account_id=? AND plan_date=?", (user["id"], account_id, plan_date.isoformat())).fetchone()
    scenarios = json.loads(plan["content_json"]).get("scenarios", []) if plan else []
    zone = ZoneInfo(plan["timezone"] if plan else "Asia/Shanghai"); start = datetime.combine(plan_date, datetime.min.time(), zone).astimezone(timezone.utc); end = start + timedelta(days=1)
    rows = db.execute("""SELECT * FROM trade_intentions WHERE user_id=? AND account_id=? AND created_at>=? AND created_at<? ORDER BY id DESC""",
                      (user["id"], account_id, start.isoformat().replace("+00:00", "Z"), end.isoformat().replace("+00:00", "Z"))).fetchall()
    return dict(plan_id=plan["id"] if plan else None, scenarios=scenarios, items=[out(db, row) for row in rows])


@router.post("/intentions", status_code=201)
def create_intention(payload: IntentionCreate, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    owned_account(db, user["id"], payload.account_id)
    if payload.day_plan_id:
        plan = db.execute("SELECT * FROM day_plans WHERE id=? AND user_id=? AND account_id=?", (payload.day_plan_id, user["id"], payload.account_id)).fetchone()
        if plan is None: raise HTTPException(400, "日计划不属于当前账户")
        if payload.scenario_id and payload.scenario_id not in {item["id"] for item in json.loads(plan["content_json"]).get("scenarios", [])}:
            raise HTTPException(400, "计划场景不存在")
    cursor = db.execute("""INSERT INTO trade_intentions(user_id,account_id,day_plan_id,scenario_id,playbook_version_id,symbol,direction,state,entry_basis,risk_plan)
        VALUES(?,?,?,?,?,?,?,?,?,?)""", (user["id"], payload.account_id, payload.day_plan_id, payload.scenario_id, payload.playbook_version_id,
        payload.symbol, payload.direction, payload.state, payload.entry_basis, payload.risk_plan))
    db.execute("INSERT INTO intention_events(intention_id,to_state,reason) VALUES(?,?,?)", (cursor.lastrowid, payload.state, "创建交易意图"))
    return out(db, db.execute("SELECT * FROM trade_intentions WHERE id=?", (cursor.lastrowid,)).fetchone())


@router.post("/intentions/{intention_id}/transition")
def transition(intention_id: int, payload: Transition, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    row = owned_intention(db, user["id"], intention_id)
    allowed = {"watching": {"prepared", "abandoned", "invalidated", "expired"}, "prepared": {"watching", "executed_unlinked", "abandoned", "invalidated", "expired"},
               "executed_unlinked": {"linked", "abandoned"}, "linked": set(), "abandoned": set(), "invalidated": set(), "expired": set()}
    if payload.state not in allowed[row["state"]]: raise HTTPException(409, "不允许从当前状态转为目标状态")
    if payload.state in ("abandoned", "invalidated", "expired") and not payload.reason: raise HTTPException(400, "结束意图时请填写原因")
    db.execute("UPDATE trade_intentions SET state=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", (payload.state, intention_id))
    db.execute("INSERT INTO intention_events(intention_id,from_state,to_state,reason) VALUES(?,?,?,?)", (intention_id, row["state"], payload.state, payload.reason))
    return out(db, db.execute("SELECT * FROM trade_intentions WHERE id=?", (intention_id,)).fetchone())


@router.get("/intentions/{intention_id}/candidates")
def candidates(intention_id: int, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    row = owned_intention(db, user["id"], intention_id); projection.refresh(db, user["id"])
    return [dict(trade_id=item["id"], symbol=item["symbol"], direction=item["direction"], open_time=item["open_time"], close_time=item["close_time"])
            for item in db.execute("""SELECT t.* FROM trade_lifecycles t LEFT JOIN trade_intentions i ON i.linked_trade_id=t.id
                WHERE t.account_id=? AND upper(t.symbol)=? AND t.direction=? AND i.id IS NULL ORDER BY ABS(COALESCE(t.open_time,0)-?) LIMIT 10""",
                (row["account_id"], row["symbol"], row["direction"], int(datetime.fromisoformat(row["created_at"].replace("Z", "+00:00")).timestamp())))]


@router.post("/intentions/{intention_id}/link")
def link(intention_id: int, payload: LinkInput, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    row = owned_intention(db, user["id"], intention_id)
    if row["state"] not in ("prepared", "executed_unlinked"): raise HTTPException(409, "当前意图状态不能关联交易")
    trade = db.execute("""SELECT t.* FROM trade_lifecycles t JOIN accounts a ON a.id=t.account_id
        WHERE t.id=? AND a.user_id=? AND t.account_id=?""", (payload.trade_id, user["id"], row["account_id"])).fetchone()
    if trade is None: raise HTTPException(404, "候选交易不存在")
    if trade["symbol"].upper() != row["symbol"] or trade["direction"] != row["direction"]: raise HTTPException(400, "交易品种或方向与意图不一致")
    try:
        db.execute("""UPDATE trade_intentions SET state='linked',linked_trade_id=?,linked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
            updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?""", (payload.trade_id, intention_id))
        db.execute("INSERT INTO intention_events(intention_id,from_state,to_state,reason) VALUES(?,?,'linked','人工确认关联完整交易')", (intention_id, row["state"]))
        return out(db, db.execute("SELECT * FROM trade_intentions WHERE id=?", (intention_id,)).fetchone())
    except psycopg.errors.IntegrityError:
        raise HTTPException(409, "该完整交易已关联其他意图")
