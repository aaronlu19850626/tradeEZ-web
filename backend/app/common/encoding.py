from __future__ import annotations
import hashlib
import json
from datetime import datetime, timezone

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-3] + "Z"


def canonical_json(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def sha256_hex(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


_DEAL_METADATA_KEYS = {"server_open_time", "server_deal_time", "server_gmt_offset"}


def deal_identity(data: dict) -> dict:
    """Return immutable deal fields used for duplicate-content checks."""
    return {key: value for key, value in data.items() if key not in _DEAL_METADATA_KEYS}


def raw_deal_identity(raw_json: str) -> dict:
    try:
        payload = json.loads(raw_json)
    except (TypeError, ValueError):
        return {}
    return deal_identity(payload) if isinstance(payload, dict) else {}

