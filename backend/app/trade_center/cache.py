from __future__ import annotations

import json
import time

from app.db import DBRow

from .schemas import TradeFilter

_CACHE: dict[tuple, tuple[float, object]] = {}
_MAX_ENTRIES = 512
_TTL_SECONDS = 3.0


def _key(user_id: int, flt: TradeFilter) -> tuple:
    return (
        user_id,
        json.dumps(flt.model_dump(exclude_none=True), sort_keys=True, default=str),
    )


def get_cached_items(user_id: int, flt: TradeFilter) -> list | None:
    key = _key(user_id, flt)
    entry = _CACHE.get(key)
    if entry is None:
        return None
    cached_at, value = entry
    if time.monotonic() - cached_at > _TTL_SECONDS:
        _CACHE.pop(key, None)
        return None
    return value if isinstance(value, list) else None


def put_cached_items(user_id: int, flt: TradeFilter, value: list) -> None:
    if len(_CACHE) >= _MAX_ENTRIES:
        _CACHE.pop(next(iter(_CACHE)))
    _CACHE[_key(user_id, flt)] = (time.monotonic(), value)


def invalidate_user(user_id: int) -> None:
    for key in [key for key in _CACHE if key[0] == user_id]:
        _CACHE.pop(key, None)
