from __future__ import annotations
import sqlite3
from ..v2_models import ApiError

def ensure_account_active(account: sqlite3.Row) -> None:
    if "status" in account.keys() and str(account["status"] or "active") != "active":
        raise ApiError(
            code="ACCOUNT_DISABLED",
            message="This MT5 account is disabled and cannot synchronize",
            status_code=403,
        )


