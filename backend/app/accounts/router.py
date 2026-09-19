from __future__ import annotations

from app.db import DBConnection, DBRow

from fastapi import APIRouter, Depends, Query
from ..db import get_db
from ..security import get_current_user
from ..schemas import (
    AccountCreateIn,
    AccountUpdateIn,
    AccountOut,
    AccountKeyOut,
    AccountMaintenanceIn,
    AccountResetIn,
)
from . import service

router = APIRouter(tags=["accounts"])


@router.get("/api/v1/my/account-maintenance-audits")
def maintenance_audits(limit: int = Query(20, ge=1, le=100), db: DBConnection = Depends(get_db), user: DBRow = Depends(get_current_user)):
    from .maintenance import audits
    return audits(db, user["id"], limit)


@router.get("/api/v1/my/account-key-rotation-audits")
def key_rotation_audits(limit: int = Query(20, ge=1, le=100), db: DBConnection = Depends(get_db), user: DBRow = Depends(get_current_user)):
    from .maintenance import key_audits
    return key_audits(db, user["id"], limit)


@router.get("/api/v1/accounts/{account_id}/maintenance-preview")
def maintenance_preview(account_id: int, db: DBConnection = Depends(get_db), user: DBRow = Depends(get_current_user)):
    from .maintenance import preview
    return preview(db, user, account_id)


@router.post("/api/v1/accounts/{account_id}/reset-sync", response_model=AccountKeyOut)
def reset_sync(account_id: int, payload: AccountResetIn, db: DBConnection = Depends(get_db), user: DBRow = Depends(get_current_user)):
    from .maintenance import execute
    return execute(db, user, account_id, payload, reset=True)


@router.delete("/api/v1/accounts/{account_id}")
def delete_account(account_id: int, payload: AccountMaintenanceIn, db: DBConnection = Depends(get_db), user: DBRow = Depends(get_current_user)):
    from .maintenance import execute
    return execute(db, user, account_id, payload, reset=False)


@router.post("/api/v1/accounts", response_model=AccountKeyOut, status_code=201)
def create_account(
    payload: AccountCreateIn,
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> AccountKeyOut:
    return service.create_account(payload, db, user)


@router.get("/api/v1/accounts", response_model=list[AccountOut])
def list_accounts(
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> list[AccountOut]:
    return service.list_accounts(db, user)


@router.get("/api/v1/accounts/{account_id}", response_model=AccountOut)
def get_account(
    account_id: int,
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> AccountOut:
    return service.get_account(account_id, db, user)


@router.patch("/api/v1/accounts/{account_id}", response_model=AccountOut)
def update_account(
    account_id: int,
    payload: AccountUpdateIn,
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> AccountOut:
    return service.update_account(account_id, payload, db, user)


@router.post("/api/v1/accounts/{account_id}/regenerate-key", response_model=AccountKeyOut)
def regenerate_account_key(
    account_id: int,
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> AccountKeyOut:
    return service.regenerate_account_key(account_id, db, user)
