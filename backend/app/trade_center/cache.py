from __future__ import annotations

import json
import threading
import time
from collections.abc import Callable
from typing import Any, TypeVar

from app.db import DBRow

from .schemas import TradeFilter

_CACHE: dict[tuple, tuple[float, object]] = {}
_INFLIGHT: dict[tuple, threading.Lock] = {}
_CACHE_LOCK = threading.RLock()
_INFLIGHT_LOCK = threading.Lock()
_MAX_ENTRIES = 512
_TTL_SECONDS = 30.0
_T = TypeVar("_T")

_STATS = {
    "hits": 0,
    "misses": 0,
    "expired": 0,
    "evictions": 0,
    "sets": 0,
    "coalesced": 0,
    "invalidated": 0,
}


def _key(user_id: int, flt: TradeFilter, variant: str = "full") -> tuple:
    return (
        user_id,
        variant,
        json.dumps(flt.model_dump(exclude_none=True), sort_keys=True, default=str),
    )


def get_cached_items(user_id: int, flt: TradeFilter, variant: str = "full") -> list | None:
    key = _key(user_id, flt, variant)
    value = _get_cached(key)
    return value if isinstance(value, list) else None


def put_cached_items(user_id: int, flt: TradeFilter, value: list, variant: str = "full") -> None:
    _put_cached(_key(user_id, flt, variant), value)


def get_cached_object(user_id: int, flt: TradeFilter, variant: str) -> object | None:
    return _get_cached(_key(user_id, flt, variant))


def put_cached_object(user_id: int, flt: TradeFilter, value: object, variant: str) -> None:
    _put_cached(_key(user_id, flt, variant), value)


def get_or_set_object(
    user_id: int,
    flt: TradeFilter,
    variant: str,
    loader: Callable[[], _T],
) -> _T:
    """Return one cached object, coalescing concurrent misses for the same key."""
    key = _key(user_id, flt, variant)
    cached = _get_cached(key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    with _INFLIGHT_LOCK:
        lock = _INFLIGHT.get(key)
        if lock is None:
            lock = threading.Lock()
            _INFLIGHT[key] = lock

    with lock:
        try:
            cached = _get_cached(key, count_miss=False)
            if cached is not None:
                with _CACHE_LOCK:
                    _STATS["coalesced"] += 1
                return cached  # type: ignore[return-value]
            value = loader()
            _put_cached(key, value)
            return value
        finally:
            with _INFLIGHT_LOCK:
                if _INFLIGHT.get(key) is lock:
                    _INFLIGHT.pop(key, None)


def _get_cached(key: tuple, *, count_miss: bool = True) -> object | None:
    with _CACHE_LOCK:
        entry = _CACHE.get(key)
        if entry is None:
            if count_miss:
                _STATS["misses"] += 1
            return None
        cached_at, value = entry
        if time.monotonic() - cached_at > _TTL_SECONDS:
            _CACHE.pop(key, None)
            if count_miss:
                _STATS["misses"] += 1
            _STATS["expired"] += 1
            return None
        _STATS["hits"] += 1
        return value


def _put_cached(key: tuple, value: object) -> None:
    with _CACHE_LOCK:
        if key not in _CACHE and len(_CACHE) >= _MAX_ENTRIES:
            _CACHE.pop(next(iter(_CACHE)))
            _STATS["evictions"] += 1
        _CACHE[key] = (time.monotonic(), value)
        _STATS["sets"] += 1


def invalidate_user(user_id: int) -> None:
    with _CACHE_LOCK:
        keys = [key for key in _CACHE if key[0] == user_id]
        for key in keys:
            _CACHE.pop(key, None)
        _STATS["invalidated"] += len(keys)


def cache_stats() -> dict[str, Any]:
    with _CACHE_LOCK:
        total = _STATS["hits"] + _STATS["misses"]
        return {
            "scope": "process",
            "entries": len(_CACHE),
            "max_entries": _MAX_ENTRIES,
            "ttl_seconds": _TTL_SECONDS,
            "hit_rate": (_STATS["hits"] / total) if total else 0.0,
            **_STATS,
        }


def reset_cache() -> None:
    """Clear cache state for tests and operational diagnostics."""
    with _CACHE_LOCK:
        _CACHE.clear()
        for key in _STATS:
            _STATS[key] = 0
    with _INFLIGHT_LOCK:
        _INFLIGHT.clear()
