"""Batch persistence helpers; the service owns commit and rollback."""
from __future__ import annotations

from app.db import DBConnection, DBRow
import json
import hmac
from ..common.encoding import utc_now_iso, canonical_json, sha256_hex
from ..v2_models import ApiError, IngestDealsRequest
from .policies import ensure_account_active


def begin_account_write(db: DBConnection, account: DBRow) -> DBRow:
    """Lock before refreshing state: authentication may precede another writer."""
    db.execute("BEGIN IMMEDIATE")
    current = db.execute("SELECT * FROM accounts WHERE id = ?", (account["id"],)).fetchone()
    if current is None:
        raise ApiError(code="ACCOUNT_NOT_FOUND", message="Account no longer exists", status_code=404)
    ensure_account_active(current)
    if current["key_revoked"] or current["key_hash"] != account["key_hash"]:
        raise ApiError(code="INVALID_SECRET_KEY", message="The provided secret key is invalid", status_code=401)
    return current

def ensure_unique_tickets(payload: IngestDealsRequest) -> None:
    tickets = [deal.ticket for deal in payload.deals]
    if len(tickets) != len(set(tickets)):
        raise ApiError(
            code="DUPLICATE_DEAL_TICKET_IN_REQUEST",
            message="ticket must be unique within a request",
            status_code=400,
        )


def upsert_ea_instance(
    db: DBConnection,
    *,
    account: DBRow,
    instance_id: str | None,
    display_name: str | None = None,
    protocol_version: str | None = None,
    ea_version: str | None = None,
) -> str:
    instance = (instance_id or "default").strip()[:80] or "default"
    protocol = (protocol_version or "2.1").strip()[:20] or "2.1"
    version = (ea_version or "").strip()[:40] or None
    name = (display_name or "").strip()[:120] or None
    now = utc_now_iso()
    db.execute(
        """
        INSERT INTO ea_instances (
            account_id, instance_id, display_name, protocol_version,
            ea_version, last_seen_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id, instance_id) DO UPDATE SET
            display_name=COALESCE(excluded.display_name, ea_instances.display_name),
            protocol_version=excluded.protocol_version,
            ea_version=COALESCE(excluded.ea_version, ea_instances.ea_version),
            last_seen_at=excluded.last_seen_at,
            updated_at=excluded.updated_at
        """,
        (account["id"], instance, name, protocol, version, now, now, now),
    )
    return instance


def start_sync_run(
    db: DBConnection,
    account: DBRow,
    *,
    instance_id: str | None = None,
    instance_name: str | None = None,
    protocol_version: str | None = None,
    ea_version: str | None = None,
) -> int:
    instance = upsert_ea_instance(
        db,
        account=account,
        instance_id=instance_id,
        display_name=instance_name,
        protocol_version=protocol_version or "2.2",
        ea_version=ea_version,
    )
    now = utc_now_iso()
    db.execute(
        """
        UPDATE sync_runs
           SET status='expired', finished_at=?, last_error='superseded by a new handshake', updated_at=?
         WHERE account_id=? AND status='open'
        """,
        (now, now, account["id"]),
    )
    cursor = db.execute(
        """
        INSERT INTO sync_runs (
            account_id, instance_id, protocol_version, status, cursor_start, started_at,
            created_at, updated_at
        ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?)
        """,
        (account["id"], instance, (protocol_version or "2.2").strip()[:20],
         max(int(account["last_sync_time"] or 0), int(account["sync_start_time"] or 0)), now, now, now),
    )
    return int(cursor.lastrowid)


def get_open_sync_run(db: DBConnection, account: DBRow, run_id: int) -> DBRow:
    run = db.execute(
        "SELECT * FROM sync_runs WHERE id = ? AND account_id = ?",
        (run_id, account["id"]),
    ).fetchone()
    if run is None:
        raise ApiError(code="SYNC_RUN_NOT_FOUND", message="Synchronization run was not found", status_code=404)
    if run["status"] != "open":
        raise ApiError(
            code="SYNC_RUN_CLOSED",
            message="This synchronization run is already closed or expired",
            status_code=409,
            details={"sync_run_id": run_id, "status": run["status"]},
        )
    return run


def validate_batch_envelope(payload: IngestDealsRequest) -> None:
    batch_fields = (payload.batch_id, payload.batch_index, payload.batch_count)
    if payload.sync_run_id is None and any(value is not None for value in batch_fields):
        raise ApiError(code="INVALID_BATCH_ENVELOPE", message="batch fields require sync_run_id", status_code=400)
    if payload.sync_run_id is not None and any(value is None for value in batch_fields):
        raise ApiError(
            code="INVALID_BATCH_ENVELOPE",
            message="batch_id, batch_index and batch_count are required with sync_run_id",
            status_code=400,
        )
    if payload.batch_count is not None and payload.batch_index is not None and payload.batch_index >= payload.batch_count:
        raise ApiError(code="INVALID_BATCH_INDEX", message="batch_index must be smaller than batch_count", status_code=400)


def refresh_run_totals(db: DBConnection, run_id: int) -> None:
    db.execute(
        """
        UPDATE sync_runs
           SET received_batch_count=(SELECT COUNT(*) FROM sync_batches WHERE sync_run_id=?),
               received_deal_count=(SELECT COALESCE(SUM(item_count), 0) FROM sync_batches WHERE sync_run_id=?),
               inserted_count=(SELECT COALESCE(SUM(inserted_count), 0) FROM sync_batches WHERE sync_run_id=?),
               updated_count=(SELECT COALESCE(SUM(updated_count), 0) FROM sync_batches WHERE sync_run_id=?),
               duplicated_count=(SELECT COALESCE(SUM(duplicated_count), 0) FROM sync_batches WHERE sync_run_id=?),
               rejected_count=(SELECT COALESCE(SUM(rejected_count), 0) FROM sync_batches WHERE sync_run_id=?),
               last_batch_at=(SELECT MAX(received_at) FROM sync_batches WHERE sync_run_id=?),
               updated_at=?
         WHERE id=?
        """,
        (run_id, run_id, run_id, run_id, run_id, run_id, run_id, utc_now_iso(), run_id),
    )


def store_deal_batch(
    db: DBConnection,
    account: DBRow,
    payload: IngestDealsRequest,
) -> dict[str, object]:
    assert payload.sync_run_id is not None
    run = get_open_sync_run(db, account, payload.sync_run_id)
    validate_batch_envelope(payload)
    assert payload.batch_id is not None
    assert payload.batch_index is not None
    assert payload.batch_count is not None

    deal_payload = [deal.model_dump() for deal in payload.deals]
    payload_hash = sha256_hex(canonical_json(deal_payload))
    if payload.request_hash and not hmac.compare_digest(payload.request_hash.strip().lower(), payload_hash):
        raise ApiError(code="BATCH_HASH_MISMATCH", message="The uploaded batch hash does not match its deals", status_code=422)

    existing = db.execute(
        "SELECT * FROM sync_batches WHERE account_id = ? AND batch_id = ?",
        (account["id"], payload.batch_id),
    ).fetchone()
    if existing is not None:
        if int(existing["sync_run_id"]) != payload.sync_run_id or int(existing["batch_index"]) != payload.batch_index:
            raise ApiError(code="BATCH_ID_CONFLICT", message="This batch_id was already used in another position", status_code=409)
        if existing["payload_hash"] != payload_hash:
            raise ApiError(code="BATCH_CONTENT_CONFLICT", message="The same batch_id was retried with different deals", status_code=409)
        db.execute("UPDATE sync_batches SET retries = retries + 1, updated_at = ? WHERE id = ?", (utc_now_iso(), existing["id"]))
        refresh_run_totals(db, payload.sync_run_id)
        return {
            "accepted": len(payload.deals),
            "inserted": 0,
            "updated": 0,
            "duplicates": len(payload.deals),
            "duplicated": len(payload.deals),
            "rejected": int(existing["rejected_count"]),
            "pending_cursor": max((deal.deal_time for deal in payload.deals if deal.entry == 1), default=None),
            "sync_run_id": payload.sync_run_id,
            "batch_id": payload.batch_id,
            "batch_status": existing["status"],
            "replayed": True,
        }

    if payload.protocol_version or payload.instance_id:
        upsert_ea_instance(
            db,
            account=account,
            instance_id=payload.instance_id,
            protocol_version=payload.protocol_version or run["protocol_version"],
        )

    inserted = updated = duplicated = rejected = 0
    batch_cursor = db.execute(
        """
        INSERT INTO sync_batches (
            account_id, sync_run_id, batch_id, batch_index, batch_count,
            item_count, request_hash, payload_hash, status, received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'receiving', ?)
        """,
        (account["id"], payload.sync_run_id, payload.batch_id, payload.batch_index,
         payload.batch_count, len(payload.deals), payload.request_hash, payload_hash, utc_now_iso()),
    )
    batch_row_id = int(batch_cursor.lastrowid)
    for deal in payload.deals:
        raw = json.dumps(deal.model_dump(), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        current = db.execute(
            "SELECT id, raw_json FROM deals WHERE account_login = ? AND ticket = ?",
            (payload.mt5_login, deal.ticket),
        ).fetchone()
        if current is None:
            cursor = db.execute(
                """
                INSERT INTO deals (
                    account_login, ticket, position_id, order_id, symbol,
                    entry, type, volume, price, sl_price, tp_price,
                    profit, swap, commission, magic, comment,
                    open_time, deal_time, server_gmt_off, raw_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload.mt5_login, deal.ticket, deal.position_id, deal.order_id,
                    deal.symbol, deal.entry, deal.type, deal.volume, deal.price,
                    deal.sl_price, deal.tp_price, deal.profit, deal.swap,
                    deal.commission, deal.magic, deal.comment, deal.open_time,
                    deal.deal_time, 0, raw,
                ),
            )
            deal_row_id = int(cursor.lastrowid)
            inserted += 1
        else:
            deal_row_id = int(current["id"])
            if current["raw_json"] != raw:
                # A ticket is an immutable deal fact. Once persisted, never overwrite
                # it with different content; conflicting retries keep the first value
                # and count as rejected rather than silently rewriting history.
                rejected += 1
            else:
                duplicated += 1
        db.execute(
            """
            INSERT OR IGNORE INTO sync_batch_refs (
                sync_batch_id, account_login, deal_ticket, deal_row_id
            ) VALUES (?, ?, ?, ?)
            """,
            (batch_row_id, payload.mt5_login, deal.ticket, deal_row_id),
        )
    db.execute(
        """
        UPDATE sync_batches
           SET inserted_count=?, updated_count=?, duplicated_count=?,
               rejected_count=?, status='received', updated_at=?
         WHERE id=?
        """,
        (inserted, updated, duplicated, rejected, utc_now_iso(), batch_row_id),
    )
    refresh_run_totals(db, payload.sync_run_id)
    return {
        "accepted": len(payload.deals),
        "inserted": inserted,
        "updated": updated,
        "duplicates": duplicated,
        "duplicated": duplicated,
        "rejected": rejected,
        "pending_cursor": max((deal.deal_time for deal in payload.deals if deal.entry == 1), default=None),
        "sync_run_id": payload.sync_run_id,
        "batch_id": payload.batch_id,
        "batch_status": "received",
    }
