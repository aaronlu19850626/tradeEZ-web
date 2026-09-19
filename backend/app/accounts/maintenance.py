"""Preview, then atomically reset/delete an owned account. Never act on stale facts."""
import hashlib
import hmac
import json

from fastapi import HTTPException

from .service import get_owned_account, generate_sync_key, account_to_out
from . import repository
from ..schemas import AccountKeyOut

LOGIN_TABLES = ("deals", "snapshots", "symbols", "ea_settings_history", "heartbeat_history", "heartbeats")
ID_TABLES = ("trade_lifecycles", "sync_runs", "sync_batches", "ea_instances", "trade_reviews")


def snapshot(db, account):
    digest = hashlib.sha256()
    # Exclude heartbeat/key-use times and audit logs: viewing the preview itself logs a request.
    digest.update(json.dumps([account[k] for k in ("id", "mt5_login", "key_hash", "sync_start_time", "last_sync_time", "status", "resync_pending", "notes", "config_revision")]).encode())
    counts = {}
    for table, column, value in [(t, "account_login", account["mt5_login"]) for t in LOGIN_TABLES] + [(t, "account_id", account["id"]) for t in ID_TABLES]:
        rows = db.execute(f"SELECT * FROM {table} WHERE {column}=? ORDER BY rowid", (value,)).fetchall()
        counts[table] = len(rows)
        # Heartbeats can arrive continuously while the user is confirming.
        if table not in ("heartbeat_history", "heartbeats", "ea_instances"):
            for row in rows:
                digest.update(table.encode())
                digest.update(json.dumps(dict(row), sort_keys=True, separators=(",", ":")).encode())
    counts["api_logs"] = db.execute("SELECT COUNT(*) FROM api_logs WHERE account_id=? OR mt5_login=?", (account["id"], account["mt5_login"])).fetchone()[0]
    attachments = db.execute("""SELECT f.id,f.review_id,f.sha256,f.size FROM review_attachments f
        JOIN trade_reviews r ON r.id=f.review_id WHERE r.account_id=? ORDER BY f.id""", (account["id"],)).fetchall()
    counts["review_attachments"] = len(attachments)
    digest.update(json.dumps([dict(row) for row in attachments], sort_keys=True).encode())
    return dict(account_id=account["id"], mt5_login=str(account["mt5_login"]), counts=counts, revision=digest.hexdigest())


def preview(db, user, account_id):
    from ..trades.projection import refresh
    get_owned_account(account_id, user, db)
    refresh(db, user["id"])
    db.execute("BEGIN")
    try:
        result = snapshot(db, get_owned_account(account_id, user, db))
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


def execute(db, user, account_id, payload, *, reset):
    db.execute("BEGIN IMMEDIATE")
    try:
        account = get_owned_account(account_id, user, db)
        if payload.confirm_login != str(account["mt5_login"]):
            raise HTTPException(400, "请输入完整且匹配的 MT5 登录号确认")
        current = snapshot(db, account)
        if not hmac.compare_digest(payload.revision, current["revision"]):
            raise HTTPException(409, "账户数据已变化，请重新加载影响范围并确认。建议先暂停 EA 同步。")
        audit_values = (user["id"], account_id, str(account["mt5_login"]), "reset" if reset else "delete", payload.reason or "",
                        payload.sync_start_time if reset else None, json.dumps(current["counts"], ensure_ascii=False, sort_keys=True))
        # Remove source references before facts; explicit deletion handles legacy tables without FKs.
        db.execute("DELETE FROM sync_runs WHERE account_id=?", (account_id,))
        db.execute("DELETE FROM sync_batches WHERE account_id=?", (account_id,))
        db.execute("DELETE FROM sync_batch_refs WHERE account_login=?", (account["mt5_login"],))
        db.execute("DELETE FROM trade_lifecycles WHERE account_id=?", (account_id,))
        for table in (("deals", "snapshots") if reset else LOGIN_TABLES):
            db.execute(f"DELETE FROM {table} WHERE account_login=?", (account["mt5_login"],))
        db.execute("DELETE FROM trade_dirty_positions WHERE account_login=?", (account["mt5_login"],))
        if reset:
            # SOP has no dataset generation id. Rotating the key fences every pre-reset request,
            # including one authenticated before we acquired the database write lock.
            key, prefix, hashed, encrypted, environment = generate_sync_key(db)
            repository.replace_key(db, (prefix, hashed, encrypted, environment, account_id))
            db.execute("""INSERT INTO account_key_rotation_audits
                (user_id,account_id,mt5_login,old_prefix,new_prefix,source) VALUES(?,?,?,?,?,'reset_sync')""",
                (user["id"], account_id, str(account["mt5_login"]), account["key_prefix"], prefix))
            db.execute("""UPDATE accounts SET sync_start_time=?,last_sync_time=0,
                          last_success_sync_at=NULL,resync_pending=1,config_revision=config_revision+1 WHERE id=?""", (payload.sync_start_time, account_id))
            row = repository.find_by_id(db, (account_id,)).fetchone()
            result = AccountKeyOut(**account_to_out(row, db).model_dump(), sync_key=key,
                                   message="请更新 EA 新密钥并重新同步；旧密钥已失效。")
        else:
            db.execute("DELETE FROM ea_instances WHERE account_id=?", (account_id,))
            db.execute("DELETE FROM api_logs WHERE account_id=? OR mt5_login=?", (account_id, account["mt5_login"]))
            db.execute("DELETE FROM accounts WHERE id=?", (account_id,))
            result = {"message": "账户及其专属业务数据已删除；备份不随本操作清除。"}
        db.execute("""INSERT INTO account_maintenance_audits(user_id,account_id,mt5_login,action,reason,sync_start_time,counts_json)
            VALUES(?,?,?,?,?,?,?)""", audit_values)
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


def audits(db, user_id, limit):
    rows = db.execute("SELECT * FROM account_maintenance_audits WHERE user_id=? ORDER BY id DESC LIMIT ?", (user_id, limit)).fetchall()
    return [dict(id=row["id"], account_id=row["account_id"], mt5_login=row["mt5_login"], action=row["action"],
                 reason=row["reason"], sync_start_time=row["sync_start_time"], counts=json.loads(row["counts_json"]), created_at=row["created_at"]) for row in rows]


def key_audits(db, user_id, limit):
    rows = db.execute("SELECT * FROM account_key_rotation_audits WHERE user_id=? ORDER BY id DESC LIMIT ?", (user_id, limit)).fetchall()
    return [dict(row) for row in rows]
