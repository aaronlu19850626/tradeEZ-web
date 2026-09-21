"""Sync operations and transactions independent of HTTP request objects."""
from __future__ import annotations

from app.db import DBConnection, DBRow
from datetime import datetime, timezone
import hashlib
import hmac
import json
import time
from .policies import ensure_account_active
from ..common.encoding import utc_now_iso, canonical_json, deal_identity, raw_deal_identity, sha256_hex
from ..config import get_settings
from ..timekeeping import observe_timezone_candidate, resolve_trade_times
from .repository import begin_account_write, ensure_unique_tickets, upsert_ea_instance, start_sync_run, get_open_sync_run, validate_batch_envelope, refresh_run_totals, store_deal_batch
from ..v2_models import (
    AccountRequest,
    ApiError,
    HeartbeatRequest,
    HeartbeatResponse,
    IngestDealsRequest,
    IngestDealsResponse,
    IngestSettingsRequest,
    IngestSettingsResponse,
    IngestSnapshotsRequest,
    IngestSnapshotsResponse,
    IngestSymbolsRequest,
    IngestSymbolsResponse,
    LastSyncTimeResponse,
    UpdateLastSyncTimeRequest,
    UpdateLastSyncTimeResponse,
)

# The EA extends its collection window 30 days before the cursor so a position's
# opening/reducing deals are included (SOP 4.2), so deals earlier than the
# configured start date are expected inside that window.
SYNC_LOOKBACK_GRACE_SECONDS = 30 * 86400

settings = get_settings()


def get_last_sync_time(payload: AccountRequest, account: DBRow, db: DBConnection) -> LastSyncTimeResponse:
    try:
        account = begin_account_write(db, account)
        # The handshake is how a client learns the current window, so it is also
        # the point where a pending date-based reset counts as acknowledged. A
        # cycle that uploaded/confirmed without a new handshake is therefore a
        # stale one and gets rejected below.
        if int(account["resync_pending"] or 0):
            db.execute("UPDATE accounts SET resync_pending = 0 WHERE id = %s", (account["id"],))
        run_id = start_sync_run(
            db,
            account,
            instance_id=payload.instance_id,
            instance_name=payload.instance_name,
            protocol_version=payload.protocol_version or "sop-1.03",
            ea_version=payload.ea_version,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    # sync_start_time is the user-configured "sync start date" (a lower bound for
    # how far back to collect). Return the effective cursor as the later of the
    # committed close-deal cursor and that configured start, so a freshly bound or
    # reset account starts from the requested date instead of the default 7-day
    # lookback. The SOP "0 triggers lookback" rule only applies when both are 0.
    cursor = max(int(account["last_sync_time"] or 0), int(account["sync_start_time"] or 0))
    return LastSyncTimeResponse(
        last_sync_time=cursor,
        account_status=str(account["status"] if "status" in account.keys() else "active"),
        sync_run_id=run_id,
        cursor=cursor,
        protocol_version="2.2",
    )


def ensure_resync_acknowledged(account: DBRow) -> None:
    """Reject a cycle that started before a date-based reset.

    The EA reads the cursor from the server and trusts it, so a client that was
    already mid-cycle when the user reset the account still carries the previous
    window. Rejecting forces the documented full retry, whose first step is a new
    cursor query that returns the reset lower bound.
    """
    if int(account["resync_pending"] or 0):
        raise ApiError(
            code="RESYNC_REQUIRED",
            message="The account was reset after this cycle started; query the cursor again before uploading or confirming",
            status_code=409,
        )


def ensure_deals_within_sync_window(account: DBRow, payload: IngestDealsRequest) -> None:
    """Refuse deals older than the account's configured sync start date.

    Without this, a stale cycle could persist records from the previous window,
    because the client cannot know a reset happened while it was collecting. The
    30-day grace matches the documented lookback the EA always sends, so only a
    genuinely stale window is rejected.
    """
    start = int(account["sync_start_time"] or 0)
    if start <= 0:
        return
    earliest = min(deal.deal_time for deal in payload.deals)
    if earliest < start - SYNC_LOOKBACK_GRACE_SECONDS:
        raise ApiError(
            code="DEAL_BEFORE_SYNC_START",
            message="The batch contains deals earlier than this account's sync start date",
            status_code=409,
            details={"sync_start_time": start, "earliest_deal_time": earliest},
        )


def ingest_deals_v21(payload: IngestDealsRequest, account: DBRow, db: DBConnection) -> IngestDealsResponse:
    ensure_unique_tickets(payload)

    try:
        account = begin_account_write(db, account)
        ensure_deals_within_sync_window(account, payload)
        if payload.sync_run_id is not None:
            result = store_deal_batch(db, account, payload)
        else:
            result = None
            inserted = updated = duplicates = rejected = 0
            for deal in payload.deals:
                deal_data = deal.model_dump()
                resolved_open, resolved_deal, timezone_profile_id = resolve_trade_times(db, account, deal_data)
                raw = json.dumps(deal_data, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
                current = db.execute(
                    "SELECT id, raw_json FROM deals WHERE account_login = ? AND ticket = ?",
                    (payload.mt5_login, deal.ticket),
                ).fetchone()
                if current is None:
                    db.execute(
                        """
                        INSERT INTO deals (
                            account_login, ticket, position_id, order_id, symbol,
                            entry, type, volume, price, sl_price, tp_price,
                            profit, swap, commission, magic, comment,
                            open_time, deal_time, server_gmt_off, raw_json,
                            server_open_time, server_deal_time, timezone_profile_id, time_normalized_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            payload.mt5_login, deal.ticket, deal.position_id, deal.order_id,
                            deal.symbol, deal.entry, deal.type, deal.volume, deal.price,
                            deal.sl_price, deal.tp_price, deal.profit, deal.swap,
                            deal.commission, deal.magic, deal.comment, resolved_open,
                            resolved_deal, deal.server_gmt_offset or 0, raw,
                            deal.server_open_time, deal.server_deal_time, timezone_profile_id, utc_now_iso(),
                        ),
                    )
                    inserted += 1
                elif raw_deal_identity(current["raw_json"]) != deal_identity(deal_data):
                    # A ticket is an immutable deal fact. Once persisted, never
                    # overwrite it with different content; conflicting retries keep
                    # the first value and count as rejected.
                    rejected += 1
                else:
                    duplicates += 1
            result = {
                "accepted": len(payload.deals),
                "inserted": inserted,
                "updated": updated,
                "duplicates": duplicates,
                "duplicated": duplicates,
                "rejected": rejected,
                "pending_cursor": max((deal.deal_time for deal in payload.deals if deal.entry == 1), default=None),
            }
        # v2.1 contract: persisting deals and advancing the cursor are separate phases.
        db.commit()
    except Exception:
        db.rollback()
        raise

    return IngestDealsResponse(**result)


def update_last_sync_time(payload: UpdateLastSyncTimeRequest, account: DBRow, db: DBConnection) -> UpdateLastSyncTimeResponse:
    now = int(time.time())
    if payload.last_sync_time > now + 300:
        raise ApiError(code="INVALID_REQUEST", message="last_sync_time is too far in the future", status_code=400)

    if payload.sync_run_id is None:
        try:
            account = begin_account_write(db, account)
            ensure_resync_acknowledged(account)
            current = max(int(account["last_sync_time"] or 0), int(account["sync_start_time"] or 0))
            final_cursor = max(current, payload.last_sync_time)
            will_advance = payload.last_sync_time > current
            if will_advance:
                exists = db.execute(
                    "SELECT 1 FROM deals WHERE account_login = ? AND deal_time = ? AND entry = 1 LIMIT 1",
                    (payload.mt5_login, payload.last_sync_time),
                ).fetchone()
                if exists is None:
                    raise ApiError(
                        code="CURSOR_AHEAD_OF_DATA",
                        message="Cannot advance the cursor before an OUT deal has this deal_time",
                        status_code=409,
                        details={"last_sync_time": payload.last_sync_time},
                    )
            db.execute(
                """
                UPDATE accounts
                SET last_sync_time = ?, resync_pending=0,
                    last_success_sync_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = ?
                """,
                (final_cursor, account["id"]),
            )
            # Legacy EAs do not identify the handshake in the confirmation. Close the
            # most recent open run so successful no-change polls do not stay pending.
            db.execute(
                """
                UPDATE sync_runs
                   SET status='committed',
                       cursor_end=?,
                       expected_batch_count=0,
                       received_batch_count=0,
                       committed_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                       finished_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id=(
                    SELECT id FROM sync_runs
                     WHERE account_id=? AND status='open' AND protocol_version='sop-1.03'
                     ORDER BY id DESC
                     LIMIT 1
                 )
                """,
                (final_cursor, account["id"]),
            )
            db.commit()
        except ApiError:
            db.rollback()
            raise
        except Exception:
            db.rollback()
            raise
        return UpdateLastSyncTimeResponse(last_sync_time=final_cursor, updated=will_advance)

    try:
        account = begin_account_write(db, account)
        ensure_resync_acknowledged(account)
        current = max(int(account["last_sync_time"] or 0), int(account["sync_start_time"] or 0))
        run = get_open_sync_run(db, account, payload.sync_run_id)
        batch_rows = db.execute(
            """
            SELECT id, batch_index, batch_count, item_count, payload_hash, status
              FROM sync_batches
             WHERE sync_run_id = ?
             ORDER BY batch_index ASC
            """,
            (payload.sync_run_id,),
        ).fetchall()
        received_indexes = {int(row["batch_index"]) for row in batch_rows}
        expected_batch_count = payload.batch_count
        if expected_batch_count is None:
            expected_batch_count = max([int(row["batch_count"]) for row in batch_rows], default=0)
        expected_indexes = set(range(expected_batch_count))
        missing = sorted(expected_indexes - received_indexes)
        if missing:
            raise ApiError(
                code="SYNC_BATCHES_MISSING",
                message="Cannot confirm synchronization because one or more batches are missing",
                status_code=409,
                details={"missing_batch_indexes": missing[:50], "missing_count": len(missing)},
            )
        if any(row["status"] != "received" for row in batch_rows):
            raise ApiError(code="SYNC_BATCH_NOT_RECEIVED", message="One or more batches were not fully received", status_code=409)

        refs_count_row = db.execute(
            "SELECT COUNT(DISTINCT deal_ticket) AS count FROM sync_batch_refs r JOIN sync_batches b ON b.id=r.sync_batch_id WHERE b.sync_run_id=?",
            (payload.sync_run_id,),
        ).fetchone()
        refs_count = int(refs_count_row["count"] or 0)
        if payload.deal_count is not None and refs_count != payload.deal_count:
            raise ApiError(
                code="SYNC_DEAL_COUNT_MISMATCH",
                message="The confirmed deal count does not match the uploaded batch references",
                status_code=409,
                details={"expected": payload.deal_count, "received": refs_count},
            )

        ordered_hashes = "".join(row["payload_hash"] for row in batch_rows if int(row["batch_index"]) in expected_indexes)
        checksum = sha256_hex(ordered_hashes.encode("ascii"))
        if payload.batch_hash and not hmac.compare_digest(payload.batch_hash.strip().lower(), checksum):
            db.execute(
                "UPDATE sync_runs SET status='failed', finished_at=?, last_error=?, updated_at=? WHERE id=?",
                (utc_now_iso(), "client batch_hash mismatch", utc_now_iso(), payload.sync_run_id),
            )
            db.commit()
            raise ApiError(code="SYNC_CHECKSUM_MISMATCH", message="The batch checksum does not match server-received data", status_code=409)

        will_advance = payload.last_sync_time > current
        if will_advance:
            exists = db.execute(
                "SELECT 1 FROM deals WHERE account_login = ? AND deal_time = ? AND entry = 1 LIMIT 1",
                (payload.mt5_login, payload.last_sync_time),
            ).fetchone()
            if exists is None:
                raise ApiError(
                    code="CURSOR_AHEAD_OF_DATA",
                    message="Cannot advance the cursor before an OUT deal has this deal_time",
                    status_code=409,
                    details={"last_sync_time": payload.last_sync_time},
                )

        final_cursor = max(current, payload.last_sync_time)
        db.execute(
            """
            UPDATE accounts
            SET last_sync_time=?, resync_pending=0,
                last_success_sync_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id=?
            """,
            (final_cursor, account["id"]),
        )
        db.execute(
            """
            UPDATE sync_runs
               SET status='committed', cursor_end=?, expected_batch_count=?,
                   received_batch_count=?, expected_deal_count=?, received_deal_count=?,
                   checksum=?, committed_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                   finished_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at=?
             WHERE id=?
            """,
            (final_cursor, expected_batch_count, len(batch_rows), payload.deal_count,
             refs_count, checksum, utc_now_iso(), payload.sync_run_id),
        )
        db.commit()
    except ApiError:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    return UpdateLastSyncTimeResponse(
        last_sync_time=max(current, payload.last_sync_time),
        updated=payload.last_sync_time > current,
        sync_run_id=payload.sync_run_id,
        handshake_confirmed=True,
        batches_received=expected_batch_count,
        batches_expected=expected_batch_count,
        deals_received=refs_count if payload.sync_run_id is not None else 0,
        checksum_valid=True,
    )


def ingest_symbols_v21(payload: IngestSymbolsRequest, account: DBRow, db: DBConnection) -> IngestSymbolsResponse:
    names = [item.name for item in payload.symbols]
    if len(names) != len(set(names)):
        raise ApiError(code="DUPLICATE_SYMBOL_IN_REQUEST", message="name must be unique within a request", status_code=400)

    try:
        account = begin_account_write(db, account)
        for item in payload.symbols:
            raw = json.dumps(item.model_dump(), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            db.execute(
                """
                INSERT INTO symbols (
                    account_login, symbol, digits, point, contract_size,
                    tick_value, tick_size, currency_base, currency_profit, raw_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(account_login, symbol) DO UPDATE SET
                    digits=excluded.digits,
                    point=excluded.point,
                    contract_size=excluded.contract_size,
                    tick_value=excluded.tick_value,
                    tick_size=excluded.tick_size,
                    raw_json=excluded.raw_json,
                    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                """,
                (payload.mt5_login, item.name, item.digits, item.point, item.contract_size,
                 item.tick_value, item.point, "", "", raw),
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return IngestSymbolsResponse(accepted=len(payload.symbols))


def ingest_snapshots_v21(payload: IngestSnapshotsRequest, account: DBRow, db: DBConnection) -> IngestSnapshotsResponse:
    try:
        account = begin_account_write(db, account)
        for item in payload.snapshots:
            raw = json.dumps(item.model_dump(), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            existing = db.execute(
                "SELECT balance, equity, margin, free_margin FROM snapshots WHERE account_login=? AND timestamp=?",
                (payload.mt5_login, item.snapshot_time),
            ).fetchone()
            if existing is not None and tuple(existing) != (item.balance, item.equity, item.margin, item.free_margin):
                raise ApiError(code="SNAPSHOT_CONFLICT", status_code=409,
                               message="Different account snapshots share the same UTC second")
            # MT5 margin level is equity / margin * 100. When margin is zero the
            # level is undefined, so store NULL instead of a misleading 0.
            margin_level = (item.equity / item.margin * 100.0) if item.margin > 0 else None
            db.execute(
                """
                INSERT OR IGNORE INTO snapshots (
                    account_login, timestamp, balance, equity, margin,
                    free_margin, margin_level, raw_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (payload.mt5_login, item.snapshot_time, item.balance, item.equity,
                 item.margin, item.free_margin, margin_level, raw),
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return IngestSnapshotsResponse(accepted=len(payload.snapshots))


def ingest_settings_v21(payload: IngestSettingsRequest, account: DBRow, db: DBConnection) -> IngestSettingsResponse:
    now = int(time.time())
    if payload.snapshot_time > now + 300:
        raise ApiError(
            code="INVALID_SETTINGS_SNAPSHOT_TIME",
            message="snapshot_time is too far in the future",
            status_code=400,
            details={"snapshot_time": payload.snapshot_time},
        )

    canonical_settings = json.dumps(
        payload.settings, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    )
    content_hash = hashlib.sha256(canonical_settings.encode("utf-8")).hexdigest()
    group_count = len(payload.settings)
    key_count = sum(len(group) for group in payload.settings.values())
    raw = json.dumps(payload.model_dump(), ensure_ascii=False, separators=(",", ":"), sort_keys=True)

    try:
        account = begin_account_write(db, account)
        existing = db.execute(
            """
            SELECT id, received_at, content_hash
              FROM ea_settings_history
             WHERE account_login = ? AND snapshot_time = ?
            """,
            (payload.mt5_login, payload.snapshot_time),
        ).fetchone()
        if existing is not None:
            if existing["content_hash"] != content_hash:
                raise ApiError(
                    code="SETTINGS_SNAPSHOT_CONFLICT",
                    message="A different settings snapshot already exists for this account and snapshot_time",
                    status_code=409,
                    details={"snapshot_time": payload.snapshot_time},
                )
            db.commit()
            return IngestSettingsResponse(data={"received_at": int(existing["received_at"])})  # type: ignore[arg-type]

        # SOP also sends settings at initialization and manual synchronization.
        # Retain distinct timestamps, including delayed snapshots; HTTP rate limits
        # still bound traffic. Same-account/same-second conflicts are explicit above.
        received_at = now
        db.execute(
            """
            INSERT INTO ea_settings_history (
                account_login, snapshot_time, settings_json, group_count,
                key_count, content_hash, raw_json, received_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.mt5_login,
                payload.snapshot_time,
                canonical_settings,
                group_count,
                key_count,
                content_hash,
                raw,
                received_at,
            ),
        )
        db.execute(
            """
            UPDATE accounts
               SET last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                   updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?
            """,
            (account["id"],),
        )
        db.commit()
    except ApiError:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    return IngestSettingsResponse(data={"received_at": received_at})  # type: ignore[arg-type]


def heartbeat_v21(payload: HeartbeatRequest, account: DBRow, db: DBConnection) -> HeartbeatResponse:
    server_time = int(time.time())
    timezone_name = payload.server_timezone_name.strip()[:32] if payload.server_timezone_name else None
    reported_broker_server = payload.broker_server.strip()[:120] if payload.broker_server else None
    raw = json.dumps(
        {
            "mt5_login": payload.mt5_login,
            "server_time": server_time,
            "version": "2.1",
            "server_gmt_offset": payload.server_gmt_offset,
            "server_timezone_name": timezone_name,
            "instance_id": payload.instance_id or "default",
            "protocol_version": payload.protocol_version or "sop-1.03",
            "ea_version": payload.ea_version,
            "broker_server": reported_broker_server,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    try:
        account = begin_account_write(db, account)
        observe_timezone_candidate(
            db,
            platform=str(account.get("platform") or "mt5"),
            broker_server=reported_broker_server or account.get("broker_server"),
            broker_company=payload.broker_company or account.get("broker_company"),
            observed_offset_seconds=payload.server_gmt_offset,
        )
        previous = db.execute(
            """
            SELECT last_seen_at, account_currency, broker_company, broker_server,
                   ea_version, server_gmt_offset, server_timezone_name
              FROM heartbeats
             WHERE account_login = ?
            """,
            (payload.mt5_login,),
        ).fetchone()
        # Liveness is the latest row, not the history, so a duplicate heartbeat
        # that changes nothing inside the write window is answered without any
        # write. This is what keeps multi-instance accounts cheap.
        if previous is not None and _heartbeat_is_redundant(previous, payload, timezone_name, server_time):
            db.commit()
            return HeartbeatResponse(ok=True, server_time=server_time)
        # The history is an audit trail, so it is sampled instead of appended on
        # every heartbeat; retention then bounds the table.
        if _should_sample_heartbeat(db, payload.mt5_login, server_time):
            db.execute(
                "INSERT INTO heartbeat_history (account_login, timestamp, version) VALUES (?, ?, ?)",
                (payload.mt5_login, server_time, "2.1"),
            )
        instance_id = upsert_ea_instance(
            db,
            account=account,
            instance_id=payload.instance_id,
            display_name=payload.instance_name,
            protocol_version=payload.protocol_version or "sop-1.03",
            ea_version=payload.ea_version,
        )
        db.execute(
            """
            INSERT INTO heartbeats (
                account_login, server_gmt_off, account_currency, broker_company,
                broker_server, ea_version, server_gmt_offset, server_timezone_name, payload
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(account_login) DO UPDATE SET
                account_currency=COALESCE(excluded.account_currency, heartbeats.account_currency),
                broker_company=COALESCE(excluded.broker_company, heartbeats.broker_company),
                broker_server=COALESCE(excluded.broker_server, heartbeats.broker_server),
                ea_version=COALESCE(excluded.ea_version, heartbeats.ea_version),
                server_gmt_offset=COALESCE(excluded.server_gmt_offset, heartbeats.server_gmt_offset),
                server_timezone_name=COALESCE(NULLIF(TRIM(excluded.server_timezone_name), ''), heartbeats.server_timezone_name),
                payload=excluded.payload,
                last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            """,
            (payload.mt5_login, 0, payload.account_currency, payload.broker_company,
             reported_broker_server, payload.ea_version,
             payload.server_gmt_offset, timezone_name, raw),
        )
        db.execute(
            """
            UPDATE accounts SET
                last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                server_gmt_off=COALESCE(?, server_gmt_off),
                server_timezone_name=COALESCE(NULLIF(TRIM(?), ''), server_timezone_name),
                account_currency=COALESCE(account_currency, ?),
                broker_company=COALESCE(?, broker_company),
                broker_server=COALESCE(NULLIF(TRIM(?), ''), broker_server),
                updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?
            """,
            (payload.server_gmt_offset, timezone_name or None, payload.account_currency,
             payload.broker_company, reported_broker_server, account["id"]),
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return HeartbeatResponse(ok=True, server_time=server_time)


def _iso_utc(epoch: int) -> str:
    """Render the same ISO-8601 shape the schema stores for timestamps."""
    return datetime.fromtimestamp(epoch, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _heartbeat_is_redundant(
    previous: DBRow,
    payload: HeartbeatRequest,
    timezone_name: str | None,
    server_time: int,
) -> bool:
    window = settings.heartbeat_write_interval_seconds
    if window > 0:
        last_seen = str(previous["last_seen_at"] or "")
        if not last_seen or last_seen < _iso_utc(server_time - window):
            return False
    else:
        return False

    def unchanged(stored, incoming) -> bool:
        # The upsert keeps the stored value when the payload omits a field.
        return incoming in (None, "") or stored == incoming

    return (
        unchanged(previous["account_currency"], payload.account_currency)
        and unchanged(previous["broker_server"], payload.broker_server)
        and unchanged(previous["ea_version"], payload.ea_version)
        and unchanged(previous["server_gmt_offset"], payload.server_gmt_offset)
        and unchanged(previous["server_timezone_name"], timezone_name)
    )


def _should_sample_heartbeat(db: DBConnection, mt5_login: int, server_time: int) -> bool:
    interval = settings.heartbeat_history_interval_seconds
    if interval <= 0:
        return True
    row = db.execute(
        "SELECT MAX(timestamp) AS last_ts FROM heartbeat_history WHERE account_login = ?",
        (mt5_login,),
    ).fetchone()
    last_ts = int(row["last_ts"] or 0) if row is not None else 0
    return server_time - last_ts >= interval
