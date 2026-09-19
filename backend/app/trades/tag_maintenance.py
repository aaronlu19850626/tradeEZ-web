"""Preview and atomically rename/merge owned review tags without rewriting notes."""
import hashlib
import hmac
import json

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TagChange(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    source: str = Field(min_length=1, max_length=40)
    target: str = Field(min_length=1, max_length=40)
    account_id: int | None = Field(default=None, gt=0, strict=True)

    @field_validator("target")
    @classmethod
    def valid_target(cls, value):
        if any(char in value for char in (",", "，", "\n", "\r")):
            raise ValueError("标签名称不能包含逗号或换行")
        return value

    @model_validator(mode="after")
    def different_names(self):
        if self.source == self.target:
            raise ValueError("新旧标签名称不能相同")
        return self


class TagApply(TagChange):
    revision: str = Field(pattern=r"^[a-f0-9]{64}$")


class DefinitionPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expected_revision: int = Field(ge=1, strict=True)
    group_name: str = Field(min_length=1, max_length=40)
    status: str = Field(pattern="^(active|disabled)$")


class BulkTags(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    trade_ids: list[int] = Field(min_length=1, max_length=100)
    tag: str = Field(min_length=1, max_length=40)
    action: str = Field(pattern="^(add|remove)$")

    @field_validator("trade_ids")
    @classmethod
    def unique_ids(cls, values):
        if any(value <= 0 for value in values): raise ValueError("交易编号必须大于 0")
        return list(dict.fromkeys(values))

    @field_validator("tag")
    @classmethod
    def valid_tag(cls, value):
        if any(char in value for char in (",", "，", "\n", "\r")): raise ValueError("标签不能包含逗号或换行")
        return value


def snapshot(db, user_id, payload):
    params = [user_id, payload.source, payload.target]
    scope = ""
    if payload.account_id is not None:
        if db.execute("SELECT 1 FROM accounts WHERE id=? AND user_id=?", (payload.account_id, user_id)).fetchone() is None:
            raise HTTPException(404, "账户不存在")
        scope = " AND r.account_id=?"
        params.append(payload.account_id)
    rows = db.execute("""SELECT r.id,r.account_id,r.revision,r.tags_json FROM trade_reviews r
        JOIN accounts a ON a.id=r.account_id WHERE a.user_id=?
        AND EXISTS (SELECT 1 FROM json_each(r.tags_json) WHERE value IN (?,?))""" + scope + " ORDER BY r.id", params).fetchall()
    affected = [row for row in rows if payload.source in json.loads(row["tags_json"])]
    digest = hashlib.sha256(json.dumps([user_id, payload.account_id, payload.source, payload.target,
                                       [dict(row) for row in rows]], sort_keys=True).encode()).hexdigest()
    result = dict(source=payload.source, target=payload.target, account_id=payload.account_id,
                  affected_reviews=len(affected), affected_accounts=len({row["account_id"] for row in affected}),
                  merged_reviews=sum(payload.target in json.loads(row["tags_json"]) for row in affected),
                  target_reviews=sum(payload.target in json.loads(row["tags_json"]) for row in rows), revision=digest)
    return result, affected


def preview(db, user_id, payload):
    db.execute("BEGIN")
    try:
        result, _ = snapshot(db, user_id, payload)
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


def apply(db, user_id, payload):
    db.execute("BEGIN IMMEDIATE")
    try:
        current, rows = snapshot(db, user_id, payload)
        if not hmac.compare_digest(current["revision"], payload.revision):
            raise HTTPException(409, "相关复盘或标签已变化，请重新预览影响范围。")
        if not rows:
            raise HTTPException(400, "当前范围内没有使用该标签的复盘")
        for row in rows:
            tags = list(dict.fromkeys(payload.target if tag == payload.source else tag for tag in json.loads(row["tags_json"])))
            db.execute("""UPDATE trade_reviews SET tags_json=?,revision=revision+1,
                updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?""", (json.dumps(tags, ensure_ascii=False), row["id"]))
            saved = db.execute("SELECT * FROM trade_reviews WHERE id=?", (row["id"],)).fetchone()
            db.execute("""INSERT INTO review_versions(review_id,revision,status,notes,tags_json,source_hash,reflection_json)
                VALUES(?,?,?,?,?,?,?)""", (saved["id"], saved["revision"], saved["status"], saved["notes"],
                saved["tags_json"], saved["source_hash"], saved["reflection_json"]))
        db.commit()
        return dict(updated_reviews=len(rows), message="标签已更新")
    except Exception:
        db.rollback()
        raise


def sync_definitions(db, user_id):
    db.execute("""INSERT OR IGNORE INTO tag_definitions(user_id,name)
        SELECT DISTINCT a.user_id,j.value FROM trade_reviews r JOIN accounts a ON a.id=r.account_id
        JOIN json_each(r.tags_json) j WHERE a.user_id=? AND j.type='text' AND j.value<>''""", (user_id,))


def definitions(db, user_id):
    sync_definitions(db, user_id)
    return [dict(row) for row in db.execute("""SELECT d.*,(SELECT COUNT(DISTINCT r.id) FROM trade_reviews r
        JOIN accounts a ON a.id=r.account_id JOIN json_each(r.tags_json) j
        WHERE a.user_id=d.user_id AND j.value=d.name) AS review_count
        FROM tag_definitions d WHERE d.user_id=? ORDER BY d.status,d.group_name,d.name""", (user_id,)).fetchall()]


def update_definition(db, user_id, definition_id, payload):
    row = db.execute("SELECT * FROM tag_definitions WHERE id=? AND user_id=?", (definition_id, user_id)).fetchone()
    if row is None: raise HTTPException(404, "标签定义不存在")
    if row["revision"] != payload.expected_revision: raise HTTPException(409, "标签定义已被修改，请重新加载")
    db.execute("UPDATE tag_definitions SET group_name=?,status=?,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", (payload.group_name, payload.status, definition_id))
    return dict(db.execute("SELECT * FROM tag_definitions WHERE id=?", (definition_id,)).fetchone())


def bulk_tags(db, user_id, payload):
    placeholders = ",".join("?" for _ in payload.trade_ids)
    rows = db.execute("""SELECT r.* FROM trade_reviews r JOIN trade_lifecycles t
        ON t.account_id=r.account_id AND t.position_id=r.position_id AND t.anchor_ticket=r.anchor_ticket
        JOIN accounts a ON a.id=t.account_id WHERE a.user_id=? AND t.id IN (""" + placeholders + ")", [user_id, *payload.trade_ids]).fetchall()
    if len(rows) != len(payload.trade_ids): raise HTTPException(400, "部分交易不存在、无权访问或尚未保存复盘")
    db.execute("BEGIN IMMEDIATE")
    try:
        changed = 0
        for row in rows:
            tags = json.loads(row["tags_json"])
            updated = list(dict.fromkeys([*tags, payload.tag])) if payload.action == "add" else [tag for tag in tags if tag != payload.tag]
            if updated == tags: continue
            db.execute("UPDATE trade_reviews SET tags_json=?,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", (json.dumps(updated, ensure_ascii=False), row["id"]))
            saved = db.execute("SELECT * FROM trade_reviews WHERE id=?", (row["id"],)).fetchone()
            db.execute("INSERT INTO review_versions(review_id,revision,status,notes,tags_json,source_hash,reflection_json) VALUES(?,?,?,?,?,?,?)", (saved["id"], saved["revision"], saved["status"], saved["notes"], saved["tags_json"], saved["source_hash"], saved["reflection_json"]))
            changed += 1
        if payload.action == "add": db.execute("INSERT OR IGNORE INTO tag_definitions(user_id,name) VALUES(?,?)", (user_id, payload.tag))
        db.commit(); return dict(updated_reviews=changed, requested_reviews=len(rows))
    except Exception: db.rollback(); raise
