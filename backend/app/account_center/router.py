from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.db import DBConnection, DBRow, get_db
from app.security import get_current_user

from . import repository, service
from .imports import get_import, import_deals
from .schemas import (
    AccountCreateIn,
    AccountDeleteIn,
    AccountKeyOut,
    AccountOut,
    AccountResetIn,
    AccountUpdateIn,
    ReportEntryOut,
    SyncKeyOut,
)

router = APIRouter(tags=["account-center"])


@router.get("/api/v1/accounts", response_model=list[AccountOut])
def list_accounts(
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> list[AccountOut]:
    return service.list_accounts(db, user)


@router.post("/api/v1/accounts", response_model=AccountKeyOut, status_code=status.HTTP_201_CREATED)
def create_account(
    payload: AccountCreateIn,
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> AccountKeyOut:
    return service.create_account(payload, db, user)


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


@router.get("/api/v1/accounts/{account_id}/sync-key", response_model=SyncKeyOut)
def get_sync_key(
    account_id: int,
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> SyncKeyOut:
    return service.get_sync_key(account_id, db, user)


@router.post("/api/v1/accounts/{account_id}/regenerate-key", response_model=AccountKeyOut)
def regenerate_key(
    account_id: int,
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> AccountKeyOut:
    return service.regenerate_key(account_id, db, user)


@router.post("/api/v1/accounts/{account_id}/reset-sync", response_model=AccountOut)
def reset_sync(
    account_id: int,
    payload: AccountResetIn,
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> AccountOut:
    return service.reset_sync(account_id, payload, db, user)


@router.delete("/api/v1/accounts/{account_id}")
def delete_account(
    account_id: int,
    payload: AccountDeleteIn,
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> dict:
    return service.delete_account(account_id, payload, db, user)


@router.get("/api/v1/accounts/{account_id}/report", response_model=ReportEntryOut)
def report_entry(
    account_id: int,
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> ReportEntryOut:
    return service.report_entry(account_id, db, user)


@router.post("/api/v1/accounts/{account_id}/imports")
def import_account_deals(
    account_id: int,
    file: UploadFile = File(...),
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> dict:
    account = repository.find_owned(db, account_id, user["id"])
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="交易账户不存在")
    return import_deals(db, user, account, file.filename or "import.csv", file.file.read())


@router.get("/api/v1/accounts/{account_id}/imports/{batch_id}")
def get_account_import(
    account_id: int,
    batch_id: int,
    db: DBConnection = Depends(get_db),
    user: DBRow = Depends(get_current_user),
) -> dict:
    return get_import(db, user, account_id, batch_id)
