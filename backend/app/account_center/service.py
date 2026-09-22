from __future__ import annotations

import hashlib
import secrets
import time

from fastapi import HTTPException, status

from app.config import get_settings
from app.crypto import decrypt_sync_key, encrypt_sync_key
from app.db import DBConnection, DBRow

from . import repository
from .schemas import (
    AccountCreateIn,
    AccountDeleteIn,
    AccountKeyOut,
    AccountOut,
    AccountResetIn,
    AccountUpdateIn,
    ReportEntryOut,
    SyncKeyOut,
    date_to_epoch,
    epoch_to_date,
    iso_to_epoch,
    market_profile_for_platform,
)
from ..trade_center.cache import invalidate_user

settings = get_settings()

ACCOUNT_LIMIT = 10
EA_ONLINE_WINDOW_SECONDS = 600
RESET_ID_SCOPED_TABLES = (
    "trade_lifecycles",
    "sync_runs",
    "sync_batches",
)


def _hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _generate_sync_key(db: DBConnection) -> tuple[str, str, str, str, str]:
    while True:
        secret = secrets.token_urlsafe(32)
        prefix = secret[:12]
        if repository.find_key_prefix(db, prefix) is None:
            break
    full_key = f"sk_live_{secret}"
    encrypted = encrypt_sync_key(full_key, settings)
    return full_key, prefix, _hash_secret(full_key), encrypted, "live"


def _owned_or_404(db: DBConnection, account_id: int, user: DBRow) -> DBRow:
    row = repository.find_owned(db, account_id, user["id"])
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="交易账户不存在")
    return row


def _account_timestamps(row: DBRow, snapshot: DBRow | None, db: DBConnection) -> tuple[int | None, int | None]:
    """Return (heartbeat_at, last_updated_at) as UTC epoch seconds."""
    heartbeat_at = iso_to_epoch(row.get("last_seen_at"))
    heartbeat_row = repository.latest_heartbeat(db, int(row["mt5_login"]))
    if heartbeat_row is not None and heartbeat_row.get("last_seen_at"):
        heartbeat_at = iso_to_epoch(heartbeat_row["last_seen_at"])

    candidates: list[int] = []
    if snapshot is not None and snapshot.get("timestamp") is not None:
        candidates.append(int(snapshot["timestamp"]))
    latest_deal_time = repository.latest_deal_time(db, int(row["mt5_login"]))
    if latest_deal_time is not None:
        candidates.append(latest_deal_time)
    # Config edits (rename / statistics toggle) must not surface as "last updated".
    # Only real synchronization signals count: heartbeat and committed cursor.
    for key in ("last_seen_at", "last_success_sync_at"):
        value = iso_to_epoch(row.get(key))
        if value is not None:
            candidates.append(value)
    last_updated_at = max(candidates) if candidates else None
    return heartbeat_at, last_updated_at


def account_to_out(row: DBRow, db: DBConnection) -> AccountOut:
    mt5_login = int(row["mt5_login"])
    snapshot = repository.latest_snapshot(db, mt5_login)
    heartbeat_at, last_updated_at = _account_timestamps(row, snapshot, db)
    now = int(time.time())
    return AccountOut(
        id=int(row["id"]),
        name=row.get("label"),
        platform=str(row.get("platform") or "mt5"),
        mt5_login=mt5_login,
        broker_server=row.get("broker_server"),
        currency=row.get("account_currency"),
        market_profile=str(row.get("market_profile") or market_profile_for_platform(str(row.get("platform") or "mt5"))),
        is_statistics=bool(row.get("is_statistics")),
        sync_start_date=epoch_to_date(row.get("sync_start_time")),
        status=str(row.get("status") or "active"),
        balance=float(snapshot["balance"]) if snapshot is not None and snapshot.get("balance") is not None else None,
        equity=float(snapshot["equity"]) if snapshot is not None and snapshot.get("equity") is not None else None,
        snapshot_time=int(snapshot["timestamp"]) if snapshot is not None else None,
        last_updated_at=last_updated_at,
        heartbeat_at=heartbeat_at,
        ea_status="online" if heartbeat_at is not None and now - heartbeat_at <= EA_ONLINE_WINDOW_SECONDS else "offline",
        trade_count=repository.trade_count(db, mt5_login),
        key_prefix=str(row["key_prefix"]),
        key_environment=str(row.get("key_environment") or "live"),
        key_created_at=row.get("key_created_at"),
        created_at=str(row["created_at"]),
    )


def list_accounts(db: DBConnection, user: DBRow) -> list[AccountOut]:
    return [account_to_out(row, db) for row in repository.list_owned(db, user["id"])]


def get_account(account_id: int, db: DBConnection, user: DBRow) -> AccountOut:
    return account_to_out(_owned_or_404(db, account_id, user), db)


def create_account(payload: AccountCreateIn, db: DBConnection, user: DBRow) -> AccountKeyOut:
    db.execute("BEGIN")
    try:
        # Serialize per-user account count and per-login binding in separate key spaces.
        db.execute("SELECT pg_advisory_xact_lock(%s)", (-int(user["id"]),)).fetchone()
        db.execute("SELECT pg_advisory_xact_lock(%s)", (payload.mt5_login,)).fetchone()

        existing = repository.find_login(db, payload.mt5_login)
        if existing is not None:
            if int(existing["user_id"]) == int(user["id"]):
                raise HTTPException(409, "该 MT5 账号已绑定到你的账户")
            raise HTTPException(409, "该 MT5 账号已被其他用户绑定")

        count = repository.count_owned(db, user["id"])
        if count >= ACCOUNT_LIMIT:
            raise HTTPException(400, f"最多只能创建 {ACCOUNT_LIMIT} 个交易账户")

        key, prefix, key_hash, encrypted, environment = _generate_sync_key(db)
        cursor = repository.insert_account(
            db,
            user_id=user["id"],
            mt5_login=payload.mt5_login,
            name=payload.name,
            platform=payload.platform,
            currency=payload.currency,
            market_profile=market_profile_for_platform(payload.platform),
            broker_server=payload.broker_server,
            sync_start_time=date_to_epoch(payload.sync_start_date) if payload.sync_start_date else 0,
            key_prefix=prefix,
            key_hash=key_hash,
            key_encrypted=encrypted,
            key_environment=environment,
            is_statistics=1,
        )
        db.commit()
        invalidate_user(int(user["id"]))
        account_id = cursor.lastrowid
    except Exception:
        db.rollback()
        raise

    row = repository.find_owned(db, account_id, user["id"])
    return AccountKeyOut(
        **account_to_out(row, db).model_dump(),
        sync_key=key,
        message="账户已创建，请将同步密钥配置到 EA。",
    )


def update_account(account_id: int, payload: AccountUpdateIn, db: DBConnection, user: DBRow) -> AccountOut:
    db.execute("BEGIN")
    try:
        _owned_or_404(db, account_id, user)
        if payload.name is not None:
            repository.update_name(db, account_id, user["id"], payload.name)
        if payload.is_statistics is not None:
            repository.update_statistics(db, account_id, user["id"], payload.is_statistics)
        db.commit()
        invalidate_user(int(user["id"]))
    except Exception:
        db.rollback()
        raise
    return account_to_out(_owned_or_404(db, account_id, user), db)


def get_sync_key(account_id: int, db: DBConnection, user: DBRow) -> SyncKeyOut:
    account = _owned_or_404(db, account_id, user)
    key = decrypt_sync_key(account.get("key_encrypted"), settings)
    if not key:
        raise HTTPException(500, "无法解密当前同步密钥，请重置密钥")
    return SyncKeyOut(sync_key=key)


def regenerate_key(account_id: int, db: DBConnection, user: DBRow) -> AccountKeyOut:
    db.execute("BEGIN")
    try:
        account = _owned_or_404(db, account_id, user)
        key, prefix, key_hash, encrypted, environment = _generate_sync_key(db)
        repository.replace_key(db, account_id, prefix, key_hash, encrypted, environment)
        db.execute(
            """
            INSERT INTO account_key_rotation_audits
                (user_id, account_id, mt5_login, old_prefix, new_prefix, source)
            VALUES (%s, %s, %s, %s, %s, 'manual')
            """,
            (user["id"], account_id, str(account["mt5_login"]), account["key_prefix"], prefix),
        )
        db.commit()
        invalidate_user(int(user["id"]))
    except Exception:
        db.rollback()
        raise

    row = repository.find_owned(db, account_id, user["id"])
    return AccountKeyOut(
        **account_to_out(row, db).model_dump(),
        sync_key=key,
        message="旧密钥已失效，请更新 EA 同步密钥。",
    )


def reset_sync(account_id: int, payload: AccountResetIn, db: DBConnection, user: DBRow) -> AccountOut:
    db.execute("BEGIN")
    try:
        account = repository.lock_owned(db, account_id, user["id"])
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="交易账户不存在")
        if payload.name != (account.get("label") or ""):
            raise HTTPException(400, "请输入准确的账户名称确认")

        mt5_login = int(account["mt5_login"])
        repository.delete_login_scoped(db, mt5_login, ("sync_batch_refs", "deals", "closed_trades"))
        repository.delete_account_id_scoped(db, account_id, RESET_ID_SCOPED_TABLES)
        repository.reset_connector_state(db, account_id, date_to_epoch(payload.sync_start_date))
        db.execute("DELETE FROM trade_dirty_positions WHERE account_login = %s", (mt5_login,))
        db.execute(
            """
            UPDATE accounts SET
                sync_start_time = %s,
                last_sync_time = 0,
                last_success_sync_at = NULL,
                resync_pending = 1,
                config_revision = config_revision + 1,
                updated_at = now_iso()
            WHERE id = %s
            """,
            (date_to_epoch(payload.sync_start_date), account_id),
        )
        db.commit()
        invalidate_user(int(user["id"]))
    except Exception:
        db.rollback()
        raise
    return account_to_out(_owned_or_404(db, account_id, user), db)


def delete_account(account_id: int, payload: AccountDeleteIn, db: DBConnection, user: DBRow) -> dict:
    db.execute("BEGIN")
    try:
        account = repository.lock_owned(db, account_id, user["id"])
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="交易账户不存在")
        if payload.name != (account.get("label") or ""):
            raise HTTPException(400, "请输入准确的账户名称确认")

        mt5_login = int(account["mt5_login"])
        repository.delete_login_scoped(db, mt5_login, repository.LOGIN_SCOPED_TABLES)
        repository.delete_api_logs(db, account_id, mt5_login)
        repository.delete_account_row(db, account_id, user["id"])
        db.commit()
        invalidate_user(int(user["id"]))
    except Exception:
        db.rollback()
        raise
    return {"message": "账户及其关联数据已删除"}


def report_entry(account_id: int, db: DBConnection, user: DBRow) -> ReportEntryOut:
    account = account_to_out(_owned_or_404(db, account_id, user), db)
    return ReportEntryOut(account=account, report=None, message="交易报告功能将在报告模块实现")
