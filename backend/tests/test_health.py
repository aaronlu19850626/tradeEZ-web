from __future__ import annotations

from test_sync_handshake import client, db  # noqa: F401  (shared pytest fixtures)


def test_healthz_is_public_and_minimal(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert "set-cookie" not in {k.lower() for k in response.headers}


def test_legacy_health_still_available(client):
    assert client.get("/health").status_code == 200


def test_readyz_reports_migrated_head(client):
    from alembic.script import ScriptDirectory
    from app.migrations import migration_config
    response = client.get("/readyz")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "ready"
    assert body["version"] == ScriptDirectory.from_config(migration_config()).get_current_head()


def test_readyz_flags_stale_schema(client, db):
    original = db.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    db.execute("UPDATE alembic_version SET version_num='stale_revision'")
    db.commit()
    try:
        response = client.get("/readyz")
        assert response.status_code == 503
        assert response.json() == {"status": "not-ready", "database": "migration-pending", "version": "stale_revision"}
    finally:
        db.execute("UPDATE alembic_version SET version_num=?", (original,))
        db.commit()
