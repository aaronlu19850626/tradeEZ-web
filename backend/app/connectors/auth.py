from __future__ import annotations

import hashlib
import hmac
import time

from fastapi import Request

from app.crypto import decrypt_sync_key
from app.db import DBConnection, DBRow
from app.v2_models import ApiError

from ..config import get_settings

settings = get_settings()


def _hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


async def authenticate_connector(
    request: Request,
    authorization: str | None,
    x_timestamp: str | None,
    x_signature: str | None,
    db: DBConnection,
) -> DBRow:
    if not authorization or not authorization.startswith("Bearer "):
        raise ApiError(code="MISSING_SECRET_KEY", message="Authorization header is required", status_code=401)

    token = authorization[7:].strip()
    parts = token.split("_", 2)
    if not token.startswith(("sk_live_", "sk_test_")) or len(parts) != 3 or len(parts[2]) < 32:
        raise ApiError(code="INVALID_SECRET_KEY", message="The provided secret key is invalid", status_code=401)

    account = db.execute(
        "SELECT * FROM accounts WHERE key_prefix = %s AND key_revoked = 0",
        (parts[2][:12],),
    ).fetchone()
    if account is None or not hmac.compare_digest(account["key_hash"], _hash_secret(token)):
        raise ApiError(code="INVALID_SECRET_KEY", message="The provided secret key is invalid", status_code=401)

    if not x_timestamp or not x_timestamp.isascii() or not x_timestamp.isdecimal():
        raise ApiError(code="TIMESTAMP_EXPIRED", message="X-Timestamp header is required", status_code=401)
    if not x_signature:
        raise ApiError(code="SIGNATURE_MISMATCH", message="X-Signature header is required", status_code=401)

    timestamp = int(x_timestamp)
    if abs(int(time.time()) - timestamp) > 300:
        raise ApiError(code="TIMESTAMP_EXPIRED", message="Request timestamp is outside the allowed 300 second window", status_code=401)

    recovered = decrypt_sync_key(account["key_encrypted"], settings)
    if recovered and not hmac.compare_digest(recovered, token):
        raise ApiError(code="INVALID_SECRET_KEY", message="The provided secret key is invalid", status_code=401)

    raw_body = await request.body()
    expected = hmac.new(token.encode(), raw_body + x_timestamp.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, x_signature.strip().lower()):
        raise ApiError(code="SIGNATURE_MISMATCH", message="Request signature does not match", status_code=401)
    return account
