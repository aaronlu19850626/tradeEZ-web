from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from app.maintenance import backup_database, check_database, restore_database


def make_database(path: Path) -> None:
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT NOT NULL)")
        db.execute("INSERT INTO notes(body) VALUES (?)", ("before-backup",))
        db.commit()


def test_backup_restore_preserves_committed_sqlite_snapshot(tmp_path: Path):
    source = tmp_path / "tradesync.db"
    backup = tmp_path / "backups" / "tradesync-backup.db"
    restored = tmp_path / "restored.db"
    make_database(source)

    result = backup_database(source, backup)
    assert Path(result["backup"]) == backup.resolve()
    assert result["integrity"] == ["ok"]

    with sqlite3.connect(source) as db:
        db.execute("INSERT INTO notes(body) VALUES (?)", ("after-backup",))
        db.commit()

    restore_result = restore_database(backup, restored)
    assert restore_result["ok"] is True
    report = check_database(restored)
    assert report["ok"] is True and report["integrity"] == ["ok"]
    with sqlite3.connect(restored) as db:
        rows = [row[0] for row in db.execute("SELECT body FROM notes ORDER BY id")]
    assert rows == ["before-backup"]

    with pytest.raises(FileExistsError):
        backup_database(source, backup)
    with pytest.raises(FileExistsError):
        restore_database(backup, restored)
    with pytest.raises(ValueError):
        backup_database(source, source)


def test_check_reports_foreign_key_violations(tmp_path: Path):
    path = tmp_path / "fk.db"
    with sqlite3.connect(path) as db:
        # Deliberately create an existing logical violation without enabling the
        # current connection's enforcement; PRAGMA foreign_key_check then finds it.
        db.execute("CREATE TABLE parent(id INTEGER PRIMARY KEY)")
        db.execute("CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id))")
        db.execute("INSERT INTO child(id, parent_id) VALUES (1, 999)")
        db.commit()

    report = check_database(path)
    assert report["integrity"] == ["ok"]
    assert report["ok"] is False
    assert report["foreign_key_violations"]
    assert report["foreign_key_violations"][0][0] == "child"


def test_check_rejects_non_sqlite_file(tmp_path: Path):
    broken = tmp_path / "broken.db"
    broken.write_text("not a sqlite database", encoding="utf-8")
    with pytest.raises(sqlite3.DatabaseError):
        check_database(broken)

