import psycopg
from app.db import DBConnection
import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..db import get_db
from ..security import get_current_user

router = APIRouter(prefix="/api/v1/my", tags=["playbooks"])


class SetupInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=2000)
    symbols: list[str] = Field(default_factory=list, max_length=50)
    directions: list[Literal["buy", "sell"]] = Field(default_factory=lambda: ["buy", "sell"], min_length=1)

    @field_validator("symbols")
    @classmethod
    def normalize_symbols(cls, values):
        return list(dict.fromkeys(value.strip().upper() for value in values if value.strip()))


class SetupPatch(SetupInput):
    status: Literal["active", "disabled"]


class Rule(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    key: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,39}$")
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    group: Literal["environment", "location", "trigger", "invalidation", "risk", "management", "exit", "prohibited"]
    checkpoint: Literal["pre_trade", "entry", "in_trade", "exit", "review"]
    answer_type: Literal["boolean", "number", "choice", "text"] = "boolean"
    evaluation: Literal["manual", "deterministic"] = "manual"
    critical: bool = False
    allow_na: bool = False
    weight: float = Field(default=1, gt=0, le=100)
    options: list[str] = Field(default_factory=list, max_length=20)
    unit: str = Field(default="", max_length=30)

    @model_validator(mode="after")
    def valid_answer(self):
        if self.answer_type == "choice" and len(self.options) < 2:
            raise ValueError("选项规则至少需要两个选项")
        if self.answer_type == "text":
            self.weight = 1
        if self.critical and self.allow_na:
            raise ValueError("关键规则默认不能设为可不适用")
        return self


class PlaybookInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=0, strict=True)
    content: dict[Literal["market", "locations", "triggers", "invalidations", "risk", "management", "exit", "prohibited"], str]
    rules: list[Rule] = Field(default_factory=list, max_length=100)

    @field_validator("rules")
    @classmethod
    def unique_keys(cls, values):
        if len({rule.key for rule in values}) != len(values):
            raise ValueError("规则标识不能重复")
        return values


def owned_setup(db, user_id, setup_id):
    row = db.execute("SELECT * FROM setups WHERE id=? AND user_id=?", (setup_id, user_id)).fetchone()
    if row is None:
        raise HTTPException(404, "Setup 不存在")
    return row


def version_out(row):
    if row is None:
        return None
    return dict(id=row["id"], version=row["version"], status=row["status"], revision=row["revision"],
                content=json.loads(row["content_json"]), rules=json.loads(row["rules_json"]),
                created_at=row["created_at"], updated_at=row["updated_at"], published_at=row["published_at"])


def setup_out(db, row):
    draft = db.execute("SELECT * FROM playbook_versions WHERE setup_id=? AND status='draft'", (row["id"],)).fetchone()
    published = db.execute("SELECT * FROM playbook_versions WHERE setup_id=? AND status='published' ORDER BY version DESC LIMIT 1", (row["id"],)).fetchone()
    return dict(id=row["id"], name=row["name"], description=row["description"], symbols=json.loads(row["symbols_json"]),
                directions=json.loads(row["directions_json"]), status=row["status"], created_at=row["created_at"],
                updated_at=row["updated_at"], draft=version_out(draft), latest_published=version_out(published))


@router.get("/setups")
def list_setups(db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    return [setup_out(db, row) for row in db.execute("SELECT * FROM setups WHERE user_id=? ORDER BY status,name,id", (user["id"],))]


@router.post("/setups", status_code=201)
def create_setup(payload: SetupInput, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    db.execute("BEGIN IMMEDIATE")
    try:
        cursor = db.execute("INSERT INTO setups(user_id,name,description,symbols_json,directions_json) VALUES(?,?,?,?,?)",
                            (user["id"], payload.name, payload.description, json.dumps(payload.symbols, ensure_ascii=False), json.dumps(payload.directions)))
        db.execute("INSERT INTO playbook_versions(setup_id,version,content_json,rules_json) VALUES(?,1,'{}','[]')", (cursor.lastrowid,))
        row = db.execute("SELECT * FROM setups WHERE id=?", (cursor.lastrowid,)).fetchone(); db.commit()
        return setup_out(db, row)
    except psycopg.errors.IntegrityError:
        db.rollback(); raise HTTPException(409, "Setup 名称已存在")
    except Exception:
        db.rollback(); raise


@router.patch("/setups/{setup_id}")
def update_setup(setup_id: int, payload: SetupPatch, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    owned_setup(db, user["id"], setup_id)
    try:
        db.execute("""UPDATE setups SET name=?,description=?,symbols_json=?,directions_json=?,status=?,
            updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?""", (payload.name, payload.description,
            json.dumps(payload.symbols, ensure_ascii=False), json.dumps(payload.directions), payload.status, setup_id))
        return setup_out(db, db.execute("SELECT * FROM setups WHERE id=?", (setup_id,)).fetchone())
    except psycopg.errors.IntegrityError:
        raise HTTPException(409, "Setup 名称已存在")


@router.post("/setups/{setup_id}/draft")
def create_draft(setup_id: int, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    owned_setup(db, user["id"], setup_id)
    current = db.execute("SELECT * FROM playbook_versions WHERE setup_id=? AND status='draft'", (setup_id,)).fetchone()
    if current: return version_out(current)
    latest = db.execute("SELECT * FROM playbook_versions WHERE setup_id=? ORDER BY version DESC LIMIT 1", (setup_id,)).fetchone()
    cursor = db.execute("INSERT INTO playbook_versions(setup_id,version,content_json,rules_json) VALUES(?,?,?,?)",
                        (setup_id, (latest["version"] if latest else 0) + 1, latest["content_json"] if latest else "{}", latest["rules_json"] if latest else "[]"))
    return version_out(db.execute("SELECT * FROM playbook_versions WHERE id=?", (cursor.lastrowid,)).fetchone())


@router.put("/playbook-versions/{version_id}")
def save_draft(version_id: int, payload: PlaybookInput, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    row = db.execute("""SELECT v.* FROM playbook_versions v JOIN setups s ON s.id=v.setup_id
        WHERE v.id=? AND s.user_id=?""", (version_id, user["id"])).fetchone()
    if row is None: raise HTTPException(404, "Playbook 版本不存在")
    if row["status"] != "draft": raise HTTPException(409, "已发布版本不可修改，请创建新草稿")
    if row["revision"] != payload.expected_revision: raise HTTPException(409, "草稿已在其他窗口修改，请重新加载")
    db.execute("""UPDATE playbook_versions SET content_json=?,rules_json=?,revision=revision+1,
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?""",
        (json.dumps(payload.content, ensure_ascii=False), json.dumps([rule.model_dump() for rule in payload.rules], ensure_ascii=False), version_id))
    return version_out(db.execute("SELECT * FROM playbook_versions WHERE id=?", (version_id,)).fetchone())


@router.post("/playbook-versions/{version_id}/publish")
def publish(version_id: int, expected_revision: int, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    row = db.execute("""SELECT v.*,s.status AS setup_status FROM playbook_versions v JOIN setups s ON s.id=v.setup_id
        WHERE v.id=? AND s.user_id=?""", (version_id, user["id"])).fetchone()
    if row is None: raise HTTPException(404, "Playbook 版本不存在")
    if row["setup_status"] != "active": raise HTTPException(409, "已停用 Setup 不能发布")
    if row["status"] != "draft" or row["revision"] != expected_revision: raise HTTPException(409, "草稿状态已变化，请重新加载")
    content = json.loads(row["content_json"]); rules = json.loads(row["rules_json"])
    if not any(str(value).strip() for value in content.values()) or not rules:
        raise HTTPException(400, "发布前至少填写一项 Playbook 内容并添加一条规则")
    db.execute("""UPDATE playbook_versions SET status='published',published_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?""", (version_id,))
    return version_out(db.execute("SELECT * FROM playbook_versions WHERE id=?", (version_id,)).fetchone())
