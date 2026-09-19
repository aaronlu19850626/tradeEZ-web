from __future__ import annotations
import time
from collections import defaultdict, deque
from threading import Lock
from ..v2_models import ApiError

_rate_buckets: dict[str, deque[float]] = defaultdict(deque)
_rate_lock = Lock()


def check_rate_limit(scope: str, identity: str, limit: int, window_seconds: int = 60) -> None:
    key = f"{scope}:{identity}"
    now = time.time()
    with _rate_lock:
        bucket = _rate_buckets[key]
        while bucket and now - bucket[0] >= window_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = max(1, int(window_seconds - (now - bucket[0])))
            raise ApiError(
                code="RATE_LIMIT_EXCEEDED",
                message="Request rate limit exceeded",
                status_code=429,
                details={"retry_after_seconds": retry_after},
            )
        bucket.append(now)


