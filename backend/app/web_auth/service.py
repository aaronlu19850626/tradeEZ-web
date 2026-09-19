from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
import time

from fastapi import HTTPException, status
from ..config import get_settings
from ..schemas import (
    SendCodeIn,
    SendCodeOut,
    VerifyCodeIn,
    VerifyCodeOut,
    UserOut,
)
from ..emailer import send_verification_email
from ..sms import send_verification_sms
from ..security import create_access_token
from . import repository

settings = get_settings()


def code_hash(email: str, code: str) -> str:
    raw = f"{email.lower()}:{code}:{settings.auth_secret}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def send_login_code(payload: SendCodeIn, db: sqlite3.Connection, client_ip: str | None = None) -> SendCodeOut:
    db.execute("BEGIN IMMEDIATE")
    try:
        now = int(time.time())
        email = payload.identity
        test_mode = settings.test_codes_enabled
        ip_hash = hmac.new(settings.auth_secret.encode(), (client_ip or "unknown").encode(), hashlib.sha256).hexdigest()

        ip_count = db.execute("SELECT COUNT(*) FROM auth_codes WHERE request_ip_hash=? AND created_at>=?",
                              (ip_hash, now-3600)).fetchone()[0]
        total_count = db.execute("SELECT COUNT(*) FROM auth_codes WHERE created_at>=?", (now-86400,)).fetchone()[0]
        if ip_count >= settings.code_max_per_ip_hour or total_count >= settings.code_max_total_per_day:
            raise HTTPException(status_code=429, detail="验证码请求过于频繁，请稍后重试")

        latest = repository.latest_code_time(db, (email,)).fetchone()
        if latest and now - int(latest["created_at"]) < settings.code_cooldown_seconds:
            retry_after = settings.code_cooldown_seconds - (now - int(latest["created_at"]))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"请等待 {retry_after} 秒后重新发送验证码",
                headers={"Retry-After": str(retry_after)},
            )

        hour_count = repository.code_count_since(db, (email, now - 3600)).fetchone()["count"]
        if hour_count >= settings.code_max_per_hour:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="该账号验证码请求过于频繁，请一小时后重试")

        code = "123456" if test_mode else f"{secrets.randbelow(1_000_000):06d}"
        repository.invalidate_previous_codes(db, email, now)
        code_id = repository.insert_code(db, (email, code_hash(email, code), now + settings.code_ttl_seconds, now,
                                              int(test_mode), ip_hash)).lastrowid
        db.commit()

        try:
            if not test_mode:
                if payload.phone:
                    send_verification_sms(settings, payload.phone, code)
                else:
                    send_verification_email(settings, email, code, max(1, settings.code_ttl_seconds // 60))
        except Exception:
            db.execute("UPDATE auth_codes SET consumed=1,consumed_at=?,delivery_status='failed' WHERE id=?", (int(time.time()), code_id))
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="验证码发送失败，请稍后重试或联系管理员检查短信/邮箱配置",
            ) from None

        db.execute("UPDATE auth_codes SET delivery_status='sent' WHERE id=?", (code_id,))
        db.commit()

        return SendCodeOut(
            message=(f"测试模式：验证码为 123456，有效期 {settings.code_ttl_seconds // 60} 分钟，不实际发送短信或邮件。"
                     if test_mode else "验证码已发送，请查看短信。" if payload.phone else "验证码已发送，请查收邮件（包括垃圾邮件）。"),
            expires_in=settings.code_ttl_seconds,
            cooldown_seconds=settings.code_cooldown_seconds,
        )

    finally:
        if db.in_transaction:
            db.rollback()


def verify_login_code(payload: VerifyCodeIn, db: sqlite3.Connection) -> VerifyCodeOut:
    db.execute("BEGIN IMMEDIATE")
    try:
        now = int(time.time())
        email = payload.identity
        candidate_hash = code_hash(email, payload.code)
        row = repository.find_valid_code(db, (email, now, int(settings.test_codes_enabled))).fetchone()

        if row is None or not hmac.compare_digest(row["code_hash"], candidate_hash):
            if row is not None:
                attempts = int(row["attempts"]) + 1
                if attempts >= 5:
                    repository.exhaust_code(db, (attempts, now, row["id"]))
                else:
                    repository.record_failed_attempt(db, (attempts, row["id"]))
                db.commit()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="验证码错误或已过期，请重新获取")

        repository.consume_code(db, (now, row["id"]))
        existing = repository.find_user_id(db, (email,)).fetchone()
        is_new_user = existing is None
        if is_new_user:
            repository.insert_user(db, (email,))
        repository.record_login(db, (email,))
        db.commit()

        user_row = repository.get_user_by_email(db, (email,)).fetchone()
        return VerifyCodeOut(
            access_token=create_access_token(user_row, settings),
            is_new_user=is_new_user,
            user=UserOut.model_validate(dict(user_row)),
        )

    finally:
        if db.in_transaction:
            db.rollback()


def read_current_user(current_user: sqlite3.Row) -> UserOut:
    return UserOut.model_validate(dict(current_user))
