from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

from app.trade_center import cache
from app.trade_center.schemas import TradeFilter


def test_object_cache_coalesces_concurrent_misses():
    cache.reset_cache()
    calls = 0
    calls_lock = threading.Lock()
    flt = TradeFilter(currency="USD")

    def loader() -> dict[str, bool]:
        nonlocal calls
        with calls_lock:
            calls += 1
        time.sleep(0.05)
        return {"ok": True}

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: cache.get_or_set_object(1, flt, "overview", loader), range(4)))

    assert calls == 1
    assert all(result is results[0] for result in results)
    stats = cache.cache_stats()
    assert stats["coalesced"] >= 3
    cache.reset_cache()


def test_cache_stats_track_expiration(monkeypatch):
    cache.reset_cache()
    flt = TradeFilter(currency="CNY")
    cache.put_cached_object(1, flt, {"value": 1}, "overview")
    assert cache.get_cached_object(1, flt, "overview") == {"value": 1}

    monkeypatch.setattr(cache, "_TTL_SECONDS", -1.0)
    assert cache.get_cached_object(1, flt, "overview") is None
    stats = cache.cache_stats()
    assert stats["expired"] == 1
    assert stats["misses"] >= 1
    cache.reset_cache()


def test_internal_cache_stats_api(client, monkeypatch):
    cache.reset_cache()
    mock_settings = SimpleNamespace(internal_api_token="cache-test-token")
    monkeypatch.setattr("app.internal_timezone.get_settings", lambda: mock_settings)

    response = client.get(
        "/api/v1/internal/cache/stats",
        headers={"X-Internal-Token": "cache-test-token"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["scope"] == "process"
    assert body["max_entries"] == 512
    assert body["ttl_seconds"] == 30.0
    assert {"hits", "misses", "expired", "evictions", "sets", "coalesced", "invalidated"} <= set(body)
    cache.reset_cache()
