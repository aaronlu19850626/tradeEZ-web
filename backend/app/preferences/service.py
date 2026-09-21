from __future__ import annotations

import json

from fastapi import HTTPException, status

from app.db import DBConnection, DBRow

from . import repository
from .schemas import MAX_PAYLOAD_BYTES, PreferenceIn, PreferenceOut


def get_preference(namespace: str, db: DBConnection, user: DBRow) -> PreferenceOut:
    row = repository.find(db, int(user["id"]), namespace)
    if row is None:
        return PreferenceOut(namespace=namespace, payload=None, updated_at=None)
    try:
        payload = json.loads(row["payload"])
    except (TypeError, ValueError):
        # A corrupted row must not break the page; the client falls back to defaults.
        payload = None
    return PreferenceOut(namespace=namespace, payload=payload, updated_at=row["updated_at"])


def save_preference(namespace: str, payload: PreferenceIn, db: DBConnection, user: DBRow) -> PreferenceOut:
    encoded = json.dumps(payload.payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    if len(encoded.encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="偏好内容过大",
        )
    repository.upsert(db, int(user["id"]), namespace, encoded)
    db.commit()
    return get_preference(namespace, db, user)
