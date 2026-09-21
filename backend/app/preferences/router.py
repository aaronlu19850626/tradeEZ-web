from __future__ import annotations

from fastapi import APIRouter, Depends, Path

from app.db import DBConnection, DBRow, get_db
from app.security import get_current_user

from . import service
from .schemas import NAMESPACE_PATTERN, PreferenceIn, PreferenceOut

router = APIRouter(tags=["preferences"])

Namespace = Path(pattern=NAMESPACE_PATTERN)


@router.get("/api/v1/preferences/{namespace}", response_model=PreferenceOut)
def read_preference(
    namespace: str = Namespace,
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> PreferenceOut:
    return service.get_preference(namespace, db, user)


@router.put("/api/v1/preferences/{namespace}", response_model=PreferenceOut)
def write_preference(
    payload: PreferenceIn,
    namespace: str = Namespace,
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> PreferenceOut:
    return service.save_preference(namespace, payload, db, user)
