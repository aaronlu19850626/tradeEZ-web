from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from .config import get_settings
from .db import DBConnection, get_db

router = APIRouter(prefix="/api/v1/internal/timezone", tags=["internal-timezone"])


def require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    expected = get_settings().internal_api_token
    if not expected:
        raise HTTPException(status_code=404, detail="Internal timezone API is disabled")
    if x_internal_token is None or not secrets.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=401, detail="Invalid internal token")


class ProfileIn(BaseModel):
    match_type: str = Field(min_length=1, max_length=32)
    match_value: str = Field(min_length=1, max_length=160)
    timezone_name: str | None = Field(default=None, max_length=64)
    fixed_offset_seconds: int | None = Field(default=None, ge=-43200, le=43200)
    dst_profile: str = Field(default="none", max_length=32)
    confidence: int = Field(default=100, ge=0, le=100)


@router.get("/profiles", dependencies=[Depends(require_internal_token)])
def list_profiles(db: DBConnection = Depends(get_db)) -> list[dict]:
    return [
        dict(row)
        for row in db.execute(
            "SELECT * FROM broker_timezone_profiles ORDER BY id"
        ).fetchall()
    ]


@router.post("/profiles", dependencies=[Depends(require_internal_token)], status_code=201)
def upsert_profile(payload: ProfileIn, db: DBConnection = Depends(get_db)) -> dict:
    db.execute(
        """
        INSERT INTO broker_timezone_profiles (
            match_type, match_value, timezone_name, fixed_offset_seconds, dst_profile, confidence
        ) VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT(match_type, match_value) DO UPDATE SET
            timezone_name=excluded.timezone_name,
            fixed_offset_seconds=excluded.fixed_offset_seconds,
            dst_profile=excluded.dst_profile,
            confidence=excluded.confidence,
            updated_at=now_iso()
        """,
        (
            payload.match_type,
            payload.match_value,
            payload.timezone_name,
            payload.fixed_offset_seconds,
            payload.dst_profile,
            payload.confidence,
        ),
    )
    row = db.execute(
        "SELECT * FROM broker_timezone_profiles WHERE match_type=%s AND match_value=%s",
        (payload.match_type, payload.match_value),
    ).fetchone()
    db.commit()
    return dict(row)


@router.get("/candidates", dependencies=[Depends(require_internal_token)])
def list_candidates(db: DBConnection = Depends(get_db)) -> list[dict]:
    return [
        dict(row)
        for row in db.execute(
            "SELECT * FROM broker_timezone_candidates ORDER BY confidence DESC, id"
        ).fetchall()
    ]


class PromoteIn(BaseModel):
    timezone_name: str = Field(min_length=1, max_length=64)
    dst_profile: str = Field(default="observed", max_length=32)
    confidence: int = Field(default=100, ge=0, le=100)


@router.post("/candidates/{candidate_id}/promote", dependencies=[Depends(require_internal_token)])
def promote_candidate(
    candidate_id: int,
    payload: PromoteIn,
    db: DBConnection = Depends(get_db),
) -> dict:
    candidate = db.execute(
        "SELECT * FROM broker_timezone_candidates WHERE id=%s",
        (candidate_id,),
    ).fetchone()
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    match_type = "broker_server" if candidate.get("broker_server") else "broker_company"
    match_value = candidate.get("broker_server") or candidate.get("broker_company")
    if not match_value:
        raise HTTPException(status_code=400, detail="Candidate has no broker identity")
    db.execute(
        """
        INSERT INTO broker_timezone_profiles (
            match_type, match_value, timezone_name, dst_profile, confidence
        ) VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT(match_type, match_value) DO UPDATE SET
            timezone_name=excluded.timezone_name,
            dst_profile=excluded.dst_profile,
            confidence=excluded.confidence,
            updated_at=now_iso()
        """,
        (match_type, str(match_value), payload.timezone_name, payload.dst_profile, payload.confidence),
    )
    profile = db.execute(
        "SELECT * FROM broker_timezone_profiles WHERE match_type=%s AND match_value=%s",
        (match_type, str(match_value)),
    ).fetchone()
    db.execute(
        """
        UPDATE broker_timezone_candidates
           SET inferred_timezone=%s,
               confidence=%s,
               status='matched',
               last_promoted_at=now_iso()
         WHERE id=%s
        """,
        (payload.timezone_name, payload.confidence, candidate_id),
    )
    db.commit()
    return dict(profile)
