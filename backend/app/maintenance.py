"""SQLite maintenance helpers used by operational scripts.

The functions work with file paths and open read-only connections where
possible. Online backups use SQLite's online backup API, so committed EA data
can be captured without stopping the API.
"""
from __future__ import annotations

from contextlib import closing
from pathlib import Path
import sqlite3
from typing import Any


def resolve_database_path(path: str | Path) -> Path:
    return Path(path).resolve(strict=True)


def connect_read_only(path: str | Path) -> sqlite3.Connection:
    database = resolve_database_path(path)
    return sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True)


def check_database(path: str | Path, *, quick: bool = False) -> dict[str, Any]:
    """Return physical integrity and foreign-key consistency results."""
    pragma = "quick_check" if quick else "integrity_check"
    with closing(connect_read_only(path)) as db:
        integrity = [row[0] for row in db.execute(f"PRAGMA {pragma}").fetchall()]
        foreign_keys = [tuple(row) for row in db.execute("PRAGMA foreign_key_check").fetchall()]
    return {
        "ok": integrity == ["ok"] and not foreign_keys,
        "integrity": integrity,
        "foreign_key_violations": foreign_keys,
    }


def require_physical_integrity(path: str | Path) -> dict[str, Any]:
    report = check_database(path)
    if report["integrity"] != ["ok"]:
        raise sqlite3.DatabaseError("; ".join(str(item) for item in report["integrity"]))
    return report


def backup_database(source: str | Path, destination: str | Path) -> dict[str, Any]:
    """Create an exclusive, physically consistent backup file."""
    source_path = resolve_database_path(source)
    destination_path = Path(destination).resolve()
    if source_path == destination_path:
        raise ValueError("Backup destination must differ from source")
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    with destination_path.open("xb"):
        pass
    try:
        with closing(connect_read_only(source_path)) as src:
            with closing(sqlite3.connect(destination_path)) as dst:
                src.backup(dst)
                dst.commit()
        report = require_physical_integrity(destination_path)
        return {"backup": str(destination_path), "integrity": report["integrity"]}
    except Exception:
        destination_path.unlink(missing_ok=True)
        raise


def restore_database(backup: str | Path, destination: str | Path) -> dict[str, Any]:
    """Restore a verified backup to a new path.

    Writing to a new path avoids mixing a replacement database with an old
    `-wal` file. Point TRADESYNC_DB_PATH at the restored file after verifying.
    """
    backup_path = resolve_database_path(backup)
    destination_path = Path(destination).resolve()
    if backup_path == destination_path:
        raise ValueError("Restore destination must differ from backup")
    if destination_path.exists():
        raise FileExistsError(f"Restore destination already exists: {destination_path}")
    require_physical_integrity(backup_path)
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    with destination_path.open("xb"):
        pass
    try:
        with closing(connect_read_only(backup_path)) as src:
            with closing(sqlite3.connect(destination_path)) as dst:
                src.backup(dst)
                dst.commit()
        report = check_database(destination_path)
        return {
            "restored": str(destination_path),
            "ok": report["ok"],
            "integrity": report["integrity"],
            "foreign_key_violations": report["foreign_key_violations"],
        }
    except Exception:
        destination_path.unlink(missing_ok=True)
        raise
