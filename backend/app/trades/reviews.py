import hashlib
import json

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Literal

from . import projection
from .reflection import Reflection


class ReviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0, strict=True)
    source_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    status: Literal["draft", "reviewed"]
    notes: str = Field(max_length=20000)
    tags: list[str] = Field(max_length=20)
    reflection: Reflection | None = None

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values):
        result = []
        for value in values:
            value = value.strip()
            if not value or len(value) > 40:
                raise ValueError("Each tag must contain 1–40 characters")
            if value not in result:
                result.append(value)
        return result


def source_hash(db, trade):
    allocations = [dict(row) for row in db.execute(
        "SELECT deal_ticket,role,volume,profit,swap,commission,method FROM trade_allocations WHERE trade_id=? ORDER BY deal_ticket,role",
        (trade["id"],))]
    return hashlib.sha256(json.dumps([json.loads(trade["payload_json"]), allocations], sort_keys=True).encode()).hexdigest()


def owned_trade(db, user_id, trade_id):
    row = db.execute("SELECT t.* FROM trade_lifecycles t JOIN accounts a ON a.id=t.account_id WHERE t.id=? AND a.user_id=?", (trade_id, user_id)).fetchone()
    if row is None:
        raise HTTPException(404, "Trade not found; its lifecycle may have changed")
    return row


def get_review(db, user_id, trade_id):
    projection.refresh(db, user_id)
    db.execute("BEGIN")
    try:
        trade = owned_trade(db, user_id, trade_id)
        row = db.execute("SELECT * FROM trade_reviews WHERE account_id=? AND position_id=? AND anchor_ticket=?",
                         (trade["account_id"], trade["position_id"], trade["anchor_ticket"])).fetchone()
        current = source_hash(db, trade)
        result = dict(review_id=row["id"] if row else None, revision=row["revision"] if row else 0, source_hash=current,
                      source_changed=bool(row and row["source_hash"] != current),
                      status=row["status"] if row else "draft", notes=row["notes"] if row else "",
                      reflection=Reflection.model_validate_json(row["reflection_json"] if row else "{}").model_dump(),
                      tags=json.loads(row["tags_json"]) if row else [], updated_at=row["updated_at"] if row else None)
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


def save_review(db, user_id, trade_id, payload):
    projection.refresh(db, user_id)
    db.execute("BEGIN IMMEDIATE")
    try:
        trade = owned_trade(db, user_id, trade_id)
        dirty = db.execute("""SELECT 1 FROM trade_dirty_positions d JOIN accounts a ON a.mt5_login=d.account_login
                              WHERE a.id=? AND d.position_id=?""", (trade["account_id"], trade["position_id"])).fetchone()
        current = source_hash(db, trade)
        if dirty or current != payload.source_hash:
            raise HTTPException(409, "成交数据已变化，请重新加载复盘并核对后保存。")
        identity = (trade["account_id"], trade["position_id"], trade["anchor_ticket"])
        old = db.execute("SELECT revision,reflection_json FROM trade_reviews WHERE account_id=? AND position_id=? AND anchor_ticket=?", identity).fetchone()
        if (old["revision"] if old else 0) != payload.revision:
            raise HTTPException(409, "复盘已在其他窗口修改，请保留当前文字并重新加载。")
        # Legacy clients omit reflection: preserve existing structured content.
        if payload.reflection is not None:
            reflection = payload.reflection
            if payload.status == "reviewed" and (not reflection.conclusion or not (reflection.next_action or reflection.no_new_action)):
                raise HTTPException(400, "提交已复盘时请填写结论，并填写下次行动或选择无需新增行动")
            reflection_json = reflection.model_dump_json()
        else:
            reflection_json = old["reflection_json"] if old else "{}"
        if payload.status == "reviewed" and old:
            evaluation = db.execute("SELECT complete FROM review_evaluations WHERE review_id=(SELECT id FROM trade_reviews WHERE account_id=? AND position_id=? AND anchor_ticket=?)", identity).fetchone()
            if evaluation is not None and not evaluation["complete"]:
                raise HTTPException(400, "已关联 Playbook 时，请先完成全部规则评价")
        db.execute("""INSERT INTO trade_reviews(account_id,position_id,anchor_ticket,status,notes,tags_json,source_hash,reflection_json,revision)
                      VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(account_id,position_id,anchor_ticket) DO UPDATE SET
                      status=excluded.status,notes=excluded.notes,tags_json=excluded.tags_json,source_hash=excluded.source_hash,
                      reflection_json=excluded.reflection_json,
                      revision=trade_reviews.revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')""",
                   (*identity, payload.status, payload.notes, json.dumps(payload.tags, ensure_ascii=False), current, reflection_json))
        saved = db.execute("SELECT * FROM trade_reviews WHERE account_id=? AND position_id=? AND anchor_ticket=?", identity).fetchone()
        review_id = saved["id"]
        db.execute("""INSERT INTO review_versions(review_id,revision,status,notes,tags_json,source_hash,reflection_json)
                      VALUES(?,?,?,?,?,?,?)""", (review_id, saved["revision"], saved["status"], saved["notes"],
                      saved["tags_json"], saved["source_hash"], saved["reflection_json"]))
        db.commit()
        return dict(review_id=review_id, revision=saved["revision"], message="复盘已保存")
    except Exception:
        db.rollback()
        raise


def list_reviews(db, user_id, page, page_size, account_id=None, status=None, tag=None, q=None, association=None, emotion=None, primary_error=None):
    projection.refresh(db, user_id)
    db.execute("BEGIN")
    try:
        clauses = ["a.user_id=?"]
        params = [user_id]
        if account_id is not None:
            clauses.append("r.account_id=?")
            params.append(account_id)
        if status:
            clauses.append("r.status=?")
            params.append(status)
        if tag and tag.strip():
            clauses.append("EXISTS (SELECT 1 FROM json_each(r.tags_json) WHERE value=?)")
            params.append(tag.strip())
        if q and q.strip():
            clauses.append("""(instr(lower(r.notes),lower(?))>0 OR instr(lower(COALESCE(t.symbol,'')),lower(?))>0 OR instr(CAST(r.position_id AS TEXT),?)>0
                OR instr(lower(COALESCE(json_extract(r.reflection_json,'$.conclusion'),'')),lower(?))>0
                OR instr(lower(COALESCE(json_extract(r.reflection_json,'$.next_action'),'')),lower(?))>0
                OR instr(lower(COALESCE(json_extract(r.reflection_json,'$.emotion_notes'),'')),lower(?))>0)""")
            params.extend([q.strip()] * 6)
        if emotion:
            clauses.append("(json_extract(r.reflection_json,'$.emotion_before')=? OR json_extract(r.reflection_json,'$.emotion_after')=?)")
            params.extend([emotion, emotion])
        if primary_error:
            clauses.append("json_extract(r.reflection_json,'$.primary_error')=?")
            params.append(primary_error)
        if association == "linked":
            clauses.append("t.id IS NOT NULL")
        elif association == "orphan":
            clauses.append("t.id IS NULL")
        joins = """ FROM trade_reviews r JOIN accounts a ON a.id=r.account_id
            LEFT JOIN trade_lifecycles t ON t.account_id=r.account_id
            AND t.position_id=r.position_id AND t.anchor_ticket=r.anchor_ticket
            LEFT JOIN review_evaluations re ON re.review_id=r.id
            LEFT JOIN playbook_versions pv ON pv.id=re.playbook_version_id
            LEFT JOIN setups su ON su.id=pv.setup_id """
        where = " WHERE " + " AND ".join(clauses)
        total = db.execute("SELECT COUNT(*)" + joins + where, params).fetchone()[0]
        rows = db.execute("""SELECT r.*,a.mt5_login,t.id AS trade_id,t.symbol,su.id AS setup_id,su.name AS setup_name,
                          pv.version AS playbook_version,re.complete AS evaluation_complete,re.coverage AS execution_coverage,
                          re.score AS execution_score,re.compliance AS execution_compliance,
                          re.critical_failures_json AS critical_failures_json""" + joins + where +
                          " ORDER BY r.updated_at DESC,r.id DESC LIMIT ? OFFSET ?",
                          [*params, page_size, (page-1)*page_size]).fetchall()
        items = []
        for row in rows:
            changed = False
            if row["trade_id"] is not None:
                trade = db.execute("SELECT * FROM trade_lifecycles WHERE id=?", (row["trade_id"],)).fetchone()
                changed = source_hash(db, trade) != row["source_hash"]
            items.append(dict(id=row["id"], account_login=str(row["mt5_login"]), position_id=str(row["position_id"]),
                              trade_id=row["trade_id"], symbol=row["symbol"], status=row["status"], notes=row["notes"],
                              reflection=Reflection.model_validate_json(row["reflection_json"]).model_dump(),
                              tags=json.loads(row["tags_json"]), source_changed=changed, updated_at=row["updated_at"],
                              setup_id=row["setup_id"], setup_name=row["setup_name"], playbook_version=row["playbook_version"],
                              evaluation_complete=bool(row["evaluation_complete"]) if row["evaluation_complete"] is not None else None,
                              execution_coverage=row["execution_coverage"], execution_score=row["execution_score"],
                              execution_compliance=row["execution_compliance"],
                              critical_failures=json.loads(row["critical_failures_json"] or "[]")))
        db.commit()
        return dict(items=items, total=total, page=page, page_size=page_size)
    except Exception:
        db.rollback()
        raise


def list_versions(db, user_id, trade_id, page, page_size):
    projection.refresh(db, user_id)
    db.execute("BEGIN")
    try:
        trade = owned_trade(db, user_id, trade_id)
        review = db.execute("""SELECT r.id FROM trade_reviews r WHERE r.account_id=? AND r.position_id=? AND r.anchor_ticket=?""",
                            (trade["account_id"], trade["position_id"], trade["anchor_ticket"])).fetchone()
        if review is None:
            db.commit()
            return dict(items=[], total=0, page=page, page_size=page_size)
        total = db.execute("SELECT COUNT(*) FROM review_versions WHERE review_id=?", (review["id"],)).fetchone()[0]
        rows = db.execute("""SELECT revision,status,notes,tags_json,reflection_json,created_at
                             FROM review_versions WHERE review_id=? ORDER BY revision DESC LIMIT ? OFFSET ?""",
                          (review["id"], page_size, (page - 1) * page_size)).fetchall()
        items = [dict(revision=row["revision"], status=row["status"], notes=row["notes"],
                      tags=json.loads(row["tags_json"]),
                      reflection=Reflection.model_validate_json(row["reflection_json"]).model_dump(),
                      created_at=row["created_at"]) for row in rows]
        db.commit()
        return dict(items=items, total=total, page=page, page_size=page_size)
    except Exception:
        db.rollback()
        raise


def list_tags(db, user_id, page, page_size, account_id=None, q=None):
    clauses = ["a.user_id=?", "j.type='text'", "j.value<>''"]
    params = [user_id]
    if account_id is not None:
        clauses.append("r.account_id=?")
        params.append(account_id)
    if q and q.strip():
        clauses.append("instr(lower(j.value),lower(?))>0")
        params.append(q.strip())
    grouped = """SELECT j.value AS name,COUNT(DISTINCT r.id) AS review_count
        FROM trade_reviews r JOIN accounts a ON a.id=r.account_id
        JOIN json_each(r.tags_json) j WHERE """ + " AND ".join(clauses) + " GROUP BY j.value"
    db.execute("BEGIN")
    try:
        total = db.execute("SELECT COUNT(*) FROM (" + grouped + ")", params).fetchone()[0]
        items = [dict(row) for row in db.execute(grouped + " ORDER BY review_count DESC,name ASC LIMIT ? OFFSET ?",
                                                [*params, page_size, (page - 1) * page_size])]
        db.commit()
        return dict(items=items, total=total, page=page, page_size=page_size)
    except Exception:
        db.rollback()
        raise
