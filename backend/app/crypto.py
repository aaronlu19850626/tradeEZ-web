from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from .config import Settings


def _fernet(settings: Settings) -> Fernet:
    secret = (settings.sync_key_encryption_secret or settings.auth_secret or settings.sync_key).encode("utf-8")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
    return Fernet(key)


def encrypt_sync_key(plaintext_key: str, settings: Settings) -> str:
    return _fernet(settings).encrypt(plaintext_key.encode("utf-8")).decode("ascii")


def decrypt_sync_key(encrypted_key: str | None, settings: Settings) -> str | None:
    if not encrypted_key:
        return None
    try:
        return _fernet(settings).decrypt(encrypted_key.encode("ascii")).decode("utf-8")
    except InvalidToken:
        return None
