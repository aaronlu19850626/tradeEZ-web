"""Cross-account synchronization health overview for the web workbench."""
from __future__ import annotations

import sqlite3
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query

from ..db import get_db
from ..security import get_current_user
from ..schemas import (
    SyncOverviewAccounts,
    SyncOverviewOut,
    SyncOverviewRuns,
    SyncOverviewSignalAccount,
    SyncOverviewTrades,
    SyncOverviewAccountRef,
)


def _parse_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def build_overview(db: sqlite3.Connection, user: sqlite3.Row, heartbeat_stale_after: int) -> SyncOverviewOut:
    # Reuse the account projection so lifecycle counters and auth-error state are current.
    from ..accounts.service import list_accounts
    from ..trades.projection import refresh

    refresh(db, user["id"])
    accounts = list_accounts(db, user)
    now = datetime.now(timezone.utc)
    now_epoch = int(time.time())

    trade_row = db.execute(
        """
        SELECT
            SUM(t.status='complete') AS complete_count,
            SUM(t.status='partial') AS partial_count,
            SUM(t.status='needs_review') AS review_count,
            SUM(t.status='needs_review' AND rc.id IS NULL) AS untracked_count,
            SUM(rc.state='open') AS case_open_count,
            SUM(rc.state='investigating') AS case_investigating_count,
            SUM(rc.state='resolved') AS case_resolved_count
          FROM trade_lifecycles t
          JOIN accounts a ON a.id = t.account_id
     LEFT JOIN trade_reconciliation_cases rc
            ON rc.user_id = a.user_id
           AND rc.account_id = t.account_id
           AND rc.position_id = CAST(t.position_id AS TEXT)
           AND rc.anchor_ticket = CAST(t.anchor_ticket AS TEXT)
         WHERE a.user_id = ?
        """,
        (user["id"],),
    ).fetchone()
    trades = SyncOverviewTrades(
        complete=int(trade_row["complete_count"] or 0),
        partial=int(trade_row["partial_count"] or 0),
        needs_review=int(trade_row["review_count"] or 0),
        reconciliation_untracked=int(trade_row["untracked_count"] or 0),
        reconciliation_open=int(trade_row["case_open_count"] or 0),
        reconciliation_investigating=int(trade_row["case_investigating_count"] or 0),
        reconciliation_resolved=int(trade_row["case_resolved_count"] or 0),
    )

    run_rows = db.execute(
        """
        SELECT r.status AS status, COUNT(*) AS count
          FROM sync_runs r
          JOIN accounts a ON a.id = r.account_id
         WHERE a.user_id = ?
         GROUP BY r.status
        """,
        (user["id"],),
    ).fetchall()
    run_counts = {row["status"]: int(row["count"]) for row in run_rows}
    runs = SyncOverviewRuns(**{key: run_counts.get(key, 0) for key in ("open", "committed", "expired", "failed")})

    cursor_uncommitted: list[SyncOverviewSignalAccount] = []
    heartbeat_stale: list[SyncOverviewSignalAccount] = []
    auth_errors: list[SyncOverviewSignalAccount] = []
    resync_pending_accounts: list[SyncOverviewAccountRef] = []
    disabled_accounts: list[SyncOverviewAccountRef] = []
    active = 0

    for account in accounts:
        ref = SyncOverviewAccountRef(id=account.id, mt5_login=account.mt5_login, label=account.label)
        if account.status == "disabled":
            disabled_accounts.append(ref)
        else:
            active += 1
        if account.resync_pending:
            resync_pending_accounts.append(ref)

        signal = SyncOverviewSignalAccount(
            id=account.id,
            mt5_login=account.mt5_login,
            label=account.label,
            last_sync_time=account.last_sync_time,
            latest_close_time=account.latest_close_time,
            last_seen_at=account.last_seen_at,
            sync_auth_error_code=account.sync_auth_error_code,
            sync_auth_error_at=account.sync_auth_error_at,
        )
        # A persisted OUT deal newer than the committed cursor means data arrived
        # but the two-phase cursor confirmation has not landed yet.
        if account.status == "active" and account.latest_close_time and (
            not account.last_sync_time or account.latest_close_time > account.last_sync_time
        ):
            cursor_uncommitted.append(signal)

        if account.status == "active":
            seen = _parse_utc(account.last_seen_at)
            seconds_since = int((now - seen).total_seconds()) if seen is not None else None
            if seen is None or seconds_since is None or seconds_since >= heartbeat_stale_after:
                signal.seconds_since_heartbeat = seconds_since
                heartbeat_stale.append(signal)

        if account.sync_auth_error_active:
            auth_errors.append(signal)

    accounts_summary = SyncOverviewAccounts(
        total=len(accounts),
        active=active,
        disabled=len(disabled_accounts),
        resync_pending=len(resync_pending_accounts),
    )

    return SyncOverviewOut(
        generated_at=now_epoch,
        heartbeat_stale_after=heartbeat_stale_after,
        accounts=accounts_summary,
        trades=trades,
        runs=runs,
        cursor_uncommitted=cursor_uncommitted,
        heartbeat_stale=heartbeat_stale,
        auth_errors=auth_errors,
        resync_pending_accounts=resync_pending_accounts,
        disabled_accounts=disabled_accounts,
    )


router = APIRouter(tags=["sync-overview"])


@router.get("/api/v1/my/sync-overview", response_model=SyncOverviewOut)
def sync_overview(
    heartbeat_stale_after: int = Query(1800, ge=60, le=604800),
    db: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(get_current_user),
) -> SyncOverviewOut:
    return build_overview(db, user, heartbeat_stale_after)
