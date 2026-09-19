"""SQL persistence only; transaction boundaries belong to service functions."""
from __future__ import annotations

import sqlite3
from collections.abc import Sequence


def invalidate_previous_codes(db: sqlite3.Connection, email: str, now: int) -> None:
    db.execute(
        "UPDATE auth_codes SET consumed=1, consumed_at=? WHERE email=? AND consumed=0",
        (now, email),
    )

def latest_code_time(db: sqlite3.Connection, params: Sequence[object]) -> sqlite3.Cursor:
    return db.execute("SELECT created_at FROM auth_codes WHERE email = ? ORDER BY id DESC LIMIT 1", params)


def code_count_since(db: sqlite3.Connection, params: Sequence[object]) -> sqlite3.Cursor:
    return db.execute("SELECT COUNT(*) AS count FROM auth_codes WHERE email = ? AND created_at >= ?", params)


def insert_code(db: sqlite3.Connection, params: Sequence[object]) -> sqlite3.Cursor:
    return db.execute("""INSERT INTO auth_codes
        (email,code_hash,purpose,expires_at,created_at,test_mode,request_ip_hash,delivery_status)
        VALUES (?,?,'login',?,?,?,?,'pending')""", params)


def find_valid_code(db: sqlite3.Connection, params: Sequence[object]) -> sqlite3.Cursor:
    return db.execute("""
        SELECT * FROM auth_codes
        WHERE email = ? AND consumed = 0 AND expires_at > ? AND test_mode=? AND delivery_status='sent'
        ORDER BY id DESC LIMIT 1
        """, params)


def exhaust_code(db: sqlite3.Connection, params: Sequence[object]) -> sqlite3.Cursor:
    return db.execute("UPDATE auth_codes SET consumed = 1, attempts = ?, consumed_at = ? WHERE id = ?", params)


def record_failed_attempt(db: sqlite3.Connection, params: Sequence[object]) -> sqlite3.Cursor:
    return db.execute("UPDATE auth_codes SET attempts = ? WHERE id = ?", params)


def consume_code(db: sqlite3.Connection, params: Sequence[object]) -> sqlite3.Cursor:
    return db.execute("UPDATE auth_codes SET consumed = 1, consumed_at = ? WHERE id = ?", params)


def find_user_id(db: sqlite3.Connection, params: Sequence[object]) -> sqlite3.Cursor:
    return db.execute("SELECT id FROM users WHERE email = ?", params)


def insert_user(db: sqlite3.Connection, params: Sequence[object]) -> sqlite3.Cursor:
    identity = params[0]
    phone = identity.removeprefix("phone:") if identity.startswith("phone:") else None
    return db.execute("INSERT INTO users (email,phone) VALUES (?,?)", (identity, phone))


def record_login(db: sqlite3.Connection, params: Sequence[object]) -> sqlite3.Cursor:
    return db.execute("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE email = ?", params)


def get_user_by_email(db: sqlite3.Connection, params: Sequence[object]) -> sqlite3.Cursor:
    return db.execute("SELECT id, email, phone, created_at, last_login_at FROM users WHERE email = ?", params)
