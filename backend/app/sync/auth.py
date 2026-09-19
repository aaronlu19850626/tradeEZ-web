from __future__ import annotations

from app.db import DBConnection, DBRow
import hashlib
import hmac
import time
from fastapi import Request
from ..config import get_settings
from ..crypto import decrypt_sync_key
from ..accounts.policies import ensure_account_active
from ..common.rate_limit import check_rate_limit
from ..v2_models import ApiError

settings = get_settings()

RATE_LIMITS = {
    "last_sync_time": 60,
    "deals": 300,
    # Current legacy chunked uploads and V2.2 handshakes can represent a first/full
    # historical sync with many small requests; keep enough burst headroom.
    "deals_batch": 300,
    "update_cursor": 60,
    "symbols": 10,
    "snapshots": 120,
    "settings": 30,
    # EA steady-state heartbeats arrive every 300s (12/hour); leave headroom for
    # manual and daily full-sync heartbeats so routine operations never return 429.
    "heartbeat": 30,
}

def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _verify_hmac(account: DBRow, token: str, raw_body: bytes, x_timestamp: str | None, x_signature: str | None) -> None:
    encrypted_key = account["key_encrypted"] if "key_encrypted" in account.keys() else None
    recovered = decrypt_sync_key(encrypted_key, settings)

    # Keys generated before HMAC support only have an irreversible hash. They remain
    # Bearer-compatible until rotation; all newly created keys require HMAC.
    if not recovered:
        if encrypted_key:
            raise ApiError(
                code="INTERNAL_ERROR",
                message="Sync key could not be decrypted; check TRADESYNC_SYNC_KEY_ENCRYPTION_SECRET or rotate the key",
                status_code=500,
            )
        return

    if not hmac.compare_digest(recovered, token):
        raise ApiError(code="INVALID_SECRET_KEY", message="The provided secret key is invalid", status_code=401)
    if not x_timestamp:
        raise ApiError(code="TIMESTAMP_EXPIRED", message="X-Timestamp header is required", status_code=401)
    if not x_signature:
        raise ApiError(code="SIGNATURE_MISMATCH", message="X-Signature header is required", status_code=401)

    if not x_timestamp.isascii() or not x_timestamp.isdecimal():
        raise ApiError(code="TIMESTAMP_EXPIRED", message="X-Timestamp must be decimal UTC seconds", status_code=401)
    try:
        timestamp = int(x_timestamp)
    except ValueError:
        raise ApiError(code="TIMESTAMP_EXPIRED", message="X-Timestamp must be Unix UTC seconds", status_code=401) from None

    now = int(time.time())
    if abs(now - timestamp) > 300:
        raise ApiError(code="TIMESTAMP_EXPIRED", message="Request timestamp is outside the allowed 300 second window", status_code=401)

    expected = hmac.new(
        token.encode("utf-8"),
        raw_body + x_timestamp.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, x_signature.strip().lower()):
        raise ApiError(code="SIGNATURE_MISMATCH", message="Request signature does not match", status_code=401)


async def authenticate_v2(
    request: Request,
    mt5_login: int,
    authorization: str | None,
    x_timestamp: str | None,
    x_signature: str | None,
    db: DBConnection,
) -> DBRow:
    if not authorization:
        raise ApiError(code="MISSING_SECRET_KEY", message="Authorization header is required", status_code=401)
    if not authorization.startswith("Bearer "):
        raise ApiError(code="INVALID_AUTH_FORMAT", message="Authorization must be 'Bearer <token>'", status_code=401)

    token = authorization[7:].strip()
    raw_body = await request.body()

    if token.startswith(("sk_live_", "sk_test_")):
        parts = token.split("_", 2)
        if len(parts) != 3 or len(parts[2]) < 32:
            raise ApiError(code="INVALID_SECRET_KEY", message="The provided secret key is invalid", status_code=401)
        key_prefix = parts[2][:12]
        account = db.execute(
            "SELECT * FROM accounts WHERE key_prefix = ? AND key_revoked = 0",
            (key_prefix,),
        ).fetchone()
        if account is None or not hmac.compare_digest(account["key_hash"], hash_secret(token)):
            raise ApiError(code="INVALID_SECRET_KEY", message="The provided secret key is invalid", status_code=401)
        if int(account["mt5_login"]) != int(mt5_login):
            raise ApiError(code="ACCOUNT_KEY_MISMATCH", message="The secret key cannot access this MT5 login", status_code=403)
        ensure_account_active(account)
        _verify_hmac(account, token, raw_body, x_timestamp, x_signature)
        db.execute(
            "UPDATE accounts SET key_last_used_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
            (account["id"],),
        )
        db.commit()
        return account

    if token.startswith("ts."):
        parts = token.split(".")
        if len(parts) != 3:
            raise ApiError(code="INVALID_SECRET_KEY", message="Invalid secret key", status_code=401)
        _, prefix, secret = parts
        account = db.execute(
            "SELECT * FROM accounts WHERE key_prefix = ? AND key_revoked = 0",
            (prefix,),
        ).fetchone()
        if account is None or not hmac.compare_digest(account["key_hash"], hash_secret(secret)):
            raise ApiError(code="INVALID_SECRET_KEY", message="Invalid secret key", status_code=401)
        if int(account["mt5_login"]) != int(mt5_login):
            raise ApiError(code="ACCOUNT_KEY_MISMATCH", message="Account mismatch", status_code=403)
        ensure_account_active(account)
        return account

    if hmac.compare_digest(token, settings.sync_key):
        account = db.execute("SELECT * FROM accounts WHERE mt5_login = ?", (mt5_login,)).fetchone()
        if account is None:
            raise ApiError(code="ACCOUNT_NOT_FOUND", message="Bind this MT5 account in the web console first", status_code=404)
        ensure_account_active(account)
        return account

    raise ApiError(code="INVALID_SECRET_KEY", message="The provided secret key is invalid", status_code=401)


async def get_bound_account(
    request: Request,
    payload,
    authorization: str | None,
    x_timestamp: str | None,
    x_signature: str | None,
    db: DBConnection,
    scope: str,
    window_seconds: int = 60,
    rate_limit: int | None = None,
) -> DBRow:
    account = await authenticate_v2(request, payload.mt5_login, authorization, x_timestamp, x_signature, db)
    effective_limit = rate_limit if rate_limit is not None else RATE_LIMITS[scope]
    check_rate_limit(scope, str(account["id"]), effective_limit, window_seconds)
    return account


