from app.db import DBConnection
import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ..db import get_db
from ..security import get_current_user

router = APIRouter(prefix="/api/v1/my", tags=["review-evaluations"])


class Answer(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    rule_key: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,39}$")
    status: Literal["pass", "fail", "unknown", "na"]
    evidence: str = Field(default="", max_length=2000)
    value: str = Field(default="", max_length=500)


class EvaluationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=0, strict=True)
    playbook_version_id: int = Field(gt=0, strict=True)
    answers: list[Answer] = Field(default_factory=list, max_length=100)


def owned_review(db, user_id, review_id):
    row = db.execute("""SELECT r.* FROM trade_reviews r JOIN accounts a ON a.id=r.account_id
        WHERE r.id=? AND a.user_id=?""", (review_id, user_id)).fetchone()
    if row is None: raise HTTPException(404, "复盘不存在")
    return row


def published_version(db, user_id, version_id):
    row = db.execute("""SELECT v.*,s.name AS setup_name,s.status AS setup_status FROM playbook_versions v
        JOIN setups s ON s.id=v.setup_id WHERE v.id=? AND s.user_id=? AND v.status='published'""", (version_id, user_id)).fetchone()
    if row is None: raise HTTPException(404, "已发布 Playbook 版本不存在")
    return row


def evaluation_out(row, rules=None):
    if row is None: return None
    return dict(id=row["id"], playbook_version_id=row["playbook_version_id"], revision=row["revision"],
                answers=json.loads(row["answers_json"]), complete=bool(row["complete"]), coverage=row["coverage"],
                score=row["score"], compliance=row["compliance"], critical_failures=json.loads(row["critical_failures_json"]),
                updated_at=row["updated_at"], rules=rules)


@router.get("/reviews/{review_id}/evaluation")
def get_evaluation(review_id: int, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    owned_review(db, user["id"], review_id)
    choices = [dict(id=row["id"], setup_id=row["setup_id"], setup_name=row["setup_name"], version=row["version"],
                    active=row["setup_status"] == "active", rules=json.loads(row["rules_json"])) for row in db.execute("""SELECT v.*,s.name AS setup_name,s.status AS setup_status FROM playbook_versions v
        JOIN setups s ON s.id=v.setup_id WHERE s.user_id=? AND v.status='published'
        ORDER BY s.name,v.version DESC""", (user["id"],))]
    current = db.execute("SELECT * FROM review_evaluations WHERE review_id=?", (review_id,)).fetchone()
    rules = None
    if current:
        version = published_version(db, user["id"], current["playbook_version_id"])
        rules = json.loads(version["rules_json"])
    return dict(evaluation=evaluation_out(current, rules), choices=choices)


@router.put("/reviews/{review_id}/evaluation")
def save_evaluation(review_id: int, payload: EvaluationInput, db: DBConnection = Depends(get_db), user=Depends(get_current_user)):
    owned_review(db, user["id"], review_id); version = published_version(db, user["id"], payload.playbook_version_id)
    rules = json.loads(version["rules_json"]); by_key = {rule["key"]: rule for rule in rules}
    if len({answer.rule_key for answer in payload.answers}) != len(payload.answers): raise HTTPException(400, "同一规则不能重复回答")
    for answer in payload.answers:
        rule = by_key.get(answer.rule_key)
        if rule is None: raise HTTPException(400, "回答包含当前版本不存在的规则")
        if answer.status == "na" and not rule["allow_na"]: raise HTTPException(400, f"规则“{rule['name']}”不允许选择不适用")
        if answer.status == "unknown" and not answer.evidence: raise HTTPException(400, f"规则“{rule['name']}”选择无法判断时必须说明原因")
        if rule["answer_type"] == "text" and not answer.value: raise HTTPException(400, f"文本规则“{rule['name']}”需要填写记录内容")
    answer_map = {answer.rule_key: answer for answer in payload.answers}
    complete = len(answer_map) == len(rules)
    scorable = [rule for rule in rules if rule["answer_type"] != "text" and not (answer_map.get(rule["key"]) and answer_map[rule["key"]].status == "na")]
    denominator = sum(float(rule["weight"]) for rule in scorable)
    decided = sum(float(rule["weight"]) for rule in scorable
                  if (answer := answer_map.get(rule["key"])) and answer.status in ("pass", "fail"))
    passed = sum(float(rule["weight"]) for rule in scorable
                 if (answer := answer_map.get(rule["key"])) and answer.status == "pass")
    coverage = round(decided / denominator, 6) if denominator else None
    score = round(100 * passed / denominator, 1) if denominator and decided == denominator else None
    failures = [rule["key"] for rule in rules if rule["critical"] and answer_map.get(rule["key"]) and answer_map[rule["key"]].status == "fail"]
    any_fail = any(answer.status == "fail" for answer in payload.answers)
    compliance = "violations" if any_fail else "compliant" if complete and not any(answer.status == "unknown" for answer in payload.answers) else "insufficient"
    old = db.execute("SELECT * FROM review_evaluations WHERE review_id=?", (review_id,)).fetchone()
    if version["setup_status"] != "active" and (old is None or old["playbook_version_id"] != payload.playbook_version_id):
        raise HTTPException(409, "已停用 Setup 不能用于新的规则评价")
    if (old["revision"] if old else 0) != payload.expected_revision: raise HTTPException(409, "规则评价已在其他窗口修改，请重新加载")
    answers_json = json.dumps([answer.model_dump() for answer in payload.answers], ensure_ascii=False)
    db.execute("BEGIN IMMEDIATE")
    try:
        locked = db.execute("SELECT revision FROM review_evaluations WHERE review_id=?", (review_id,)).fetchone()
        if (locked["revision"] if locked else 0) != payload.expected_revision:
            raise HTTPException(409, "规则评价已在其他窗口修改，请重新加载")
        db.execute("""INSERT INTO review_evaluations(review_id,playbook_version_id,answers_json,complete,coverage,score,compliance,critical_failures_json)
            VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(review_id) DO UPDATE SET playbook_version_id=excluded.playbook_version_id,
            answers_json=excluded.answers_json,complete=excluded.complete,coverage=excluded.coverage,score=excluded.score,
            compliance=excluded.compliance,critical_failures_json=excluded.critical_failures_json,revision=review_evaluations.revision+1,
            updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')""", (review_id, payload.playbook_version_id, answers_json,
            int(complete), coverage, score, compliance, json.dumps(failures)))
        saved = db.execute("SELECT * FROM review_evaluations WHERE review_id=?", (review_id,)).fetchone()
        db.execute("""INSERT INTO review_evaluation_versions(evaluation_id,revision,playbook_version_id,answers_json,complete,coverage,score,compliance,critical_failures_json)
            VALUES(?,?,?,?,?,?,?,?,?)""", (saved["id"], saved["revision"], saved["playbook_version_id"], saved["answers_json"],
            saved["complete"], saved["coverage"], saved["score"], saved["compliance"], saved["critical_failures_json"]))
        db.commit()
        return evaluation_out(saved, rules)
    except Exception:
        db.rollback()
        raise
