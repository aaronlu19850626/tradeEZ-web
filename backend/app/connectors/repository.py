from __future__ import annotations

import json

from app.db import DBConnection


def find_by_id(db: DBConnection, connection_id: str, account_id: int):
    return db.execute(
        """
        SELECT * FROM connector_connections
         WHERE connection_id = %s AND account_id = %s
        """,
        (connection_id, account_id),
    ).fetchone()


def ensure_connection(
    db: DBConnection,
    *,
    connection_id: str,
    account_id: int,
    platform: str,
    account_ref: str,
    instance_id: str | None,
    connector_version: str | None,
    capabilities: list[str],
):
    existing = db.execute(
        """
        SELECT * FROM connector_connections
         WHERE account_id = %s AND platform = %s AND account_ref = %s
           AND instance_id IS NOT DISTINCT FROM %s
        """,
        (account_id, platform, account_ref, instance_id),
    ).fetchone()
    if existing is not None:
        return existing

    cursor = db.execute(
        """
        INSERT INTO connector_connections (
            connection_id, account_id, platform, account_ref, instance_id,
            connector_version, protocol_version, capabilities_json
        ) VALUES (%s, %s, %s, %s, %s, %s, '1.0', %s)
        RETURNING id
        """,
        (
            connection_id,
            account_id,
            platform,
            account_ref,
            instance_id,
            connector_version,
            json.dumps(capabilities, separators=(",", ":")),
        ),
    )
    return db.execute(
        "SELECT * FROM connector_connections WHERE id = %s",
        (int(cursor.lastrowid),),
    ).fetchone()


def update_cursor(
    db: DBConnection,
    connection_id: int,
    value: int,
    state: dict | None = None,
):
    if state is not None:
        db.execute(
            """
            UPDATE connector_connections
               SET cursor_value = GREATEST(cursor_value, %s),
                   cursor_state_json = %s,
                   updated_at = now_iso()
             WHERE id = %s
            """,
            (value, json.dumps(state, separators=(",", ":")), connection_id),
        )
    else:
        db.execute(
            """
            UPDATE connector_connections
               SET cursor_value = GREATEST(cursor_value, %s),
                   updated_at = now_iso()
             WHERE id = %s
            """,
            (value, connection_id),
        )


def find_batch(db: DBConnection, connection_id: int, batch_id: str):
    return db.execute(
        "SELECT * FROM connector_batches WHERE connection_id = %s AND batch_id = %s",
        (connection_id, batch_id),
    ).fetchone()


def insert_batch(
    db: DBConnection,
    *,
    connection_id: int,
    batch_id: str,
    batch_index: int,
    batch_count: int,
    idempotency_key: str | None,
    payload_hash: str,
    item_count: int,
):
    cursor = db.execute(
        """
        INSERT INTO connector_batches (
            connection_id, batch_id, batch_index, batch_count,
            idempotency_key, payload_hash, item_count, status
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'received')
        RETURNING id
        """,
        (connection_id, batch_id, batch_index, batch_count, idempotency_key, payload_hash, item_count),
    )
    return int(cursor.lastrowid)


def insert_event(
    db: DBConnection,
    *,
    connection_id: int,
    event_id: str,
    event_type: str,
    occurred_at: int,
    batch_id: str,
    payload: dict,
) -> bool:
    cursor = db.execute(
        """
        INSERT INTO connector_events (
            connection_id, event_id, event_type, occurred_at, batch_id, payload
        ) VALUES (%s, %s, %s, %s, %s, %s::jsonb)
        ON CONFLICT (connection_id, event_id, event_type) DO NOTHING
        RETURNING id
        """,
        (connection_id, event_id, event_type, occurred_at, batch_id, json.dumps(payload, separators=(",", ":"))),
    )
    return cursor.lastrowid is not None


def refresh_batch_counts(
    db: DBConnection,
    batch_row_id: int,
    inserted: int,
    duplicates: int,
):
    db.execute(
        """
        UPDATE connector_batches
           SET inserted_count = %s,
               duplicate_count = %s,
               status = 'stored'
         WHERE id = %s
        """,
        (inserted, duplicates, batch_row_id),
    )
