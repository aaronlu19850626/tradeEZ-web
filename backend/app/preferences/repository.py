from __future__ import annotations

from app.db import DBConnection


def find(db: DBConnection, user_id: int, namespace: str):
    return db.execute(
        "SELECT payload, updated_at FROM user_preferences WHERE user_id = %s AND namespace = %s",
        (user_id, namespace),
    ).fetchone()


def upsert(db: DBConnection, user_id: int, namespace: str, payload: str) -> None:
    db.execute(
        """
        INSERT INTO user_preferences (user_id, namespace, payload)
        VALUES (%s, %s, %s)
        ON CONFLICT(user_id, namespace) DO UPDATE SET
            payload = excluded.payload,
            updated_at = now_iso()
        """,
        (user_id, namespace, payload),
    )
