"""Daily data-retention tasks, safe to run from several API instances."""
from __future__ import annotations

import logging
import threading
import time

from ..config import get_settings
from ..db import connect_db
from ..maintenance import prune_heartbeat_history

logger = logging.getLogger(__name__)

# Session-level advisory lock so only one instance prunes per period.
RETENTION_LOCK_KEY = 791_901
FIRST_RUN_DELAY_SECONDS = 120
INTERVAL_SECONDS = 24 * 3600


def _prune_once() -> None:
    settings = get_settings()
    if not settings.heartbeat_history_auto_prune:
        return
    lock = connect_db(application_name="tradesync-retention-lock")
    try:
        acquired = lock.execute(
            "SELECT pg_try_advisory_lock(%s) AS locked",
            (RETENTION_LOCK_KEY,),
        ).fetchone()["locked"]
        if not acquired:
            return
        try:
            report = prune_heartbeat_history(days=settings.heartbeat_history_retention_days)
            if report["deleted"]:
                logger.info("heartbeat history pruned: %s", report)
        finally:
            lock.execute("SELECT pg_advisory_unlock(%s)", (RETENTION_LOCK_KEY,)).fetchone()
    finally:
        lock.close()


def _loop() -> None:
    # Wait out the first window so a short-lived process (tests, CLI) never
    # starts pruning, then run once a day.
    delay = FIRST_RUN_DELAY_SECONDS
    while True:
        time.sleep(delay)
        delay = INTERVAL_SECONDS
        try:
            _prune_once()
        except Exception:  # noqa: BLE001 - retention must never kill the API
            logger.warning("heartbeat history prune failed", exc_info=True)


def start_retention_worker() -> threading.Thread | None:
    """Start the background retention loop; disabled via settings."""
    if not get_settings().heartbeat_history_auto_prune:
        return None
    worker = threading.Thread(target=_loop, name="heartbeat-retention", daemon=True)
    worker.start()
    return worker
