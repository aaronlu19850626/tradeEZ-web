from __future__ import annotations

from app.db import DBConnection, DBRow

import hashlib
import secrets

from fastapi import HTTPException, status
from ..config import get_settings
from ..schemas import (
    AccountCreateIn,
    AccountUpdateIn,
    AccountOut,
    AccountKeyOut,
)
from ..crypto import encrypt_sync_key
from . import repository

settings = get_settings()


def hash_sync_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def generate_sync_key(db: DBConnection) -> tuple[str, str, str, str, str]:
    while True:
        secret = secrets.token_urlsafe(32)
        prefix = secret[:12]
        if repository.find_key_prefix(db, (prefix,)).fetchone() is None:
            break
    full_key = f"sk_live_{secret}"
    environment = "live"
    encrypted = encrypt_sync_key(full_key, settings)
    return full_key, prefix, hash_sync_secret(full_key), encrypted, environment


def account_to_out(row: DBRow, db: DBConnection) -> AccountOut:
    stats = repository.deal_statistics(db, (row["mt5_login"],)).fetchone()
    symbol_stats = repository.symbol_statistics(db, (row["mt5_login"],)).fetchone()
    snapshot_stats = repository.snapshot_statistics(db, (row["mt5_login"], row["mt5_login"])).fetchone()
    data = dict(row)
    data["deal_count"] = int(stats["deal_count"] or 0)
    data["sync_start_locked"] = bool(data["deal_count"] or row["last_sync_time"] or db.execute(
        "SELECT 1 FROM sync_runs WHERE account_id=? LIMIT 1", (row["id"],)).fetchone())
    data["synced_order_count"] = int(stats["synced_order_count"] or 0)
    data["latest_deal_time"] = stats["latest_deal_time"]
    trades = db.execute("""SELECT SUM(t.status='complete') AS complete_count,
                           SUM(t.status='needs_review') AS review_count,
                           SUM(t.status='needs_review' AND rc.id IS NULL) AS untracked_count,
                           SUM(rc.state='open') AS case_open_count,
                           SUM(rc.state='investigating') AS case_investigating_count,
                           SUM(rc.state='resolved') AS case_resolved_count
                           FROM trade_lifecycles t LEFT JOIN trade_reconciliation_cases rc
                             ON rc.user_id=? AND rc.account_id=t.account_id
                            AND rc.position_id=CAST(t.position_id AS TEXT)
                            AND rc.anchor_ticket=CAST(t.anchor_ticket AS TEXT)
                           WHERE t.account_id=?""", (row["user_id"], row["id"])).fetchone()
    data["complete_trade_count"] = int(trades["complete_count"] or 0)
    data["review_trade_count"] = int(trades["review_count"] or 0)
    data["reconciliation_untracked_count"] = int(trades["untracked_count"] or 0)
    data["reconciliation_open_count"] = int(trades["case_open_count"] or 0)
    data["reconciliation_investigating_count"] = int(trades["case_investigating_count"] or 0)
    data["reconciliation_resolved_count"] = int(trades["case_resolved_count"] or 0)
    data["latest_close_time"] = stats["latest_close_time"]
    settings_stats = repository.settings_statistics(db, (row["mt5_login"],)).fetchone()
    data["symbol_count"] = int(symbol_stats["symbol_count"] or 0)
    data["snapshot_count"] = int(snapshot_stats["snapshot_count"] or 0)
    data["latest_snapshot_time"] = snapshot_stats["latest_snapshot_time"]
    data["latest_equity"] = snapshot_stats["latest_equity"]
    data["settings_count"] = int(settings_stats["settings_count"] or 0)
    data["latest_settings_time"] = settings_stats["latest_settings_time"]
    auth_error = db.execute("""SELECT created_at,error_code FROM api_logs
        WHERE mt5_login=? AND status_code=401
          AND error_code IN ('INVALID_SECRET_KEY','SIGNATURE_MISMATCH','TIMESTAMP_EXPIRED')
        ORDER BY id DESC LIMIT 1""", (row["mt5_login"],)).fetchone()
    data["sync_auth_error_at"] = auth_error["created_at"] if auth_error else None
    data["sync_auth_error_code"] = auth_error["error_code"] if auth_error else None
    last_valid = max(filter(None, (row["key_last_used_at"], row["last_success_sync_at"])), default=None)
    data["sync_auth_error_active"] = bool(auth_error and (last_valid is None or auth_error["created_at"] > last_valid))
    return AccountOut.model_validate(data)


def get_owned_account(account_id: int, user: DBRow, db: DBConnection) -> DBRow:
    row = repository.find_owned_account(db, (account_id, user["id"])).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MT5 account not found")
    return row


def create_account(payload: AccountCreateIn, db: DBConnection, user: DBRow) -> AccountKeyOut:
    db.execute("BEGIN IMMEDIATE")
    try:
        # Serialize concurrent binding of the same MT5 login. The second request
        # waits for the first transaction and then sees the existing account.
        db.execute("SELECT pg_advisory_xact_lock(%s)", (payload.mt5_login,)).fetchone()
        existing = repository.find_login(db, (payload.mt5_login,)).fetchone()
        if existing is not None:
            if int(existing["user_id"]) == int(user["id"]):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This MT5 account is already bound to you")
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This MT5 account is already bound to another user")

        sync_key, prefix, key_hash, encrypted_key, key_environment = generate_sync_key(db)
        cursor = repository.insert_account(db, (user["id"], payload.mt5_login, payload.label, payload.broker_server,
             payload.account_currency, payload.server_gmt_off, payload.server_timezone_name,
             payload.sync_start_time, prefix, key_hash, encrypted_key, key_environment, payload.notes))
        db.commit()
        row = repository.find_by_id(db, (cursor.lastrowid,)).fetchone()
        return AccountKeyOut(
            **account_to_out(row, db).model_dump(),
            sync_key=sync_key,
            message="Sync key is shown only once. Copy it into the EA; reset it if lost.",
        )

    finally:
        if db.in_transaction:
            db.rollback()


def list_accounts(db: DBConnection, user: DBRow) -> list[AccountOut]:
    from ..trades.projection import refresh
    refresh(db, user["id"])
    rows = repository.list_owned_accounts(db, (user["id"],)).fetchall()
    return [account_to_out(row, db) for row in rows]


def get_account(account_id: int, db: DBConnection, user: DBRow) -> AccountOut:
    from ..trades.projection import refresh
    refresh(db, user["id"])
    return account_to_out(get_owned_account(account_id, user, db), db)


def update_account(account_id: int, payload: AccountUpdateIn, db: DBConnection, user: DBRow) -> AccountOut:
    db.execute("BEGIN IMMEDIATE")
    try:
        # Serialize concurrent edits to the same account. In PostgreSQL Read
        # Committed isolation, the second request waits here and then sees the
        # configuration revision written by the first request.
        db.execute("SELECT id FROM accounts WHERE id = ? AND user_id = ? FOR UPDATE",
                   (account_id, user["id"])).fetchone()
        account = get_owned_account(account_id, user, db)
        if "notes" in payload.model_fields_set and payload.expected_revision is None:
            raise HTTPException(400, "修改备注需要提供账户配置版本，请刷新后重试")
        if payload.expected_revision is not None and payload.expected_revision != account["config_revision"]:
            raise HTTPException(409, "账户配置已在其他页面修改。你的草稿已保留，请读取最新配置后重新编辑。")
        values: dict[str, object] = {}
        for column in payload.model_fields_set:
            if column == "expected_revision":
                continue
            value = getattr(payload, column)
            if value is None and column in ("broker_server", "status", "sync_start_time"):
                raise HTTPException(400, f"{column} cannot be cleared")
            if value != account[column]:
                values[column] = value
        if "sync_start_time" in values and values["sync_start_time"] != account["sync_start_time"]:
            has_deals = db.execute("SELECT 1 FROM deals WHERE account_login=? LIMIT 1", (account["mt5_login"],)).fetchone()
            has_runs = db.execute("SELECT 1 FROM sync_runs WHERE account_id=? LIMIT 1", (account_id,)).fetchone()
            if account["last_sync_time"] or has_deals or has_runs:
                raise HTTPException(409, "该账户已经开始同步；请通过重新同步流程调整起点，普通保存不会清空数据或重置游标。")
        if not values:
            return account_to_out(account, db)
        repository.update_fields(db, account_id, user["id"], values)
        db.commit()
        row = repository.find_by_id(db, (account_id,)).fetchone()
        return account_to_out(row, db)

    finally:
        if db.in_transaction:
            db.rollback()


def regenerate_account_key(account_id: int, db: DBConnection, user: DBRow) -> AccountKeyOut:
    db.execute("BEGIN IMMEDIATE")
    try:
        account = get_owned_account(account_id, user, db)
        sync_key, prefix, key_hash, encrypted_key, key_environment = generate_sync_key(db)
        repository.replace_key(db, (prefix, key_hash, encrypted_key, key_environment, account_id))
        db.execute("""INSERT INTO account_key_rotation_audits
            (user_id,account_id,mt5_login,old_prefix,new_prefix,source) VALUES(?,?,?,?,?,'manual')""",
            (user["id"], account_id, str(account["mt5_login"]), account["key_prefix"], prefix))
        db.commit()
        row = repository.find_by_id(db, (account_id,)).fetchone()
        return AccountKeyOut(
            **account_to_out(row, db).model_dump(),
            sync_key=sync_key,
            message="Old key has been replaced. Update EA SyncKey and reload the EA.",
        )

    finally:
        if db.in_transaction:
            db.rollback()
