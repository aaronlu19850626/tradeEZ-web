from __future__ import annotations

from app.db import DBRow
from ..v2_models import ApiError


def ensure_account_active(account: DBRow) -> None:
    if "status" in account.keys() and str(account["status"] or "active") != "active":
        raise ApiError(
            code="ACCOUNT_DISABLED",
            message="This MT5 account is disabled and cannot synchronize",
            status_code=403,
        )
