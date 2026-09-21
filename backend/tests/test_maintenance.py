from __future__ import annotations

import shutil

import pytest

from app.maintenance import backup_database, check_database
from app.migrations import SCHEMA_VERSION


def test_check_database_reports_current_revision(pg_db):
    report = check_database(quick=True)
    assert report["ok"] is True
    assert report["revision"] == SCHEMA_VERSION


def test_check_database_requires_url(monkeypatch):
    monkeypatch.setenv("TRADESYNC_DATABASE_URL", "")
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError, match="TRADESYNC_DATABASE_URL"):
            check_database("postgresql://")
    finally:
        get_settings.cache_clear()


@pytest.mark.skipif(shutil.which("pg_dump") is None or shutil.which("pg_restore") is None, reason="PostgreSQL client tools are required")
def test_backup_creates_custom_dump(pg_db, tmp_path):
    backup = tmp_path / "tradesync-test.dump"
    result = backup_database(backup)
    assert backup.exists()
    assert backup.stat().st_size > 0
    assert result["backup"] == str(backup.resolve())
