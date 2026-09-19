"""One-off migration from the legacy SQLite database to PostgreSQL.

This is intentionally the only runtime code allowed to read SQLite. It creates a
verified SQLite backup first, creates the PostgreSQL baseline, copies data in
foreign-key order, preserves primary keys, resets identity sequences and
validates row counts.
"""
from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv
load_dotenv(BACKEND_ROOT / ".env", override=False)


def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def backup_sqlite(source: Path, backup_dir: Path) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    destination = backup_dir / f"tradesync.pre-postgresql.{time.strftime('%Y%m%d-%H%M%S')}.sqlite"
    with sqlite3.connect(source) as src, sqlite3.connect(destination) as dst:
        src.backup(dst)
        dst.commit()
        integrity = dst.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise RuntimeError(f"SQLite backup integrity check failed: {integrity}")
    return destination


def check_sqlite(source: Path) -> None:
    with sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True) as db:
        integrity = db.execute("PRAGMA integrity_check").fetchall()
        if [row[0] for row in integrity] != ["ok"]:
            raise RuntimeError(f"SQLite integrity check failed: {integrity}")
        violations = db.execute("PRAGMA foreign_key_check").fetchall()
        if violations:
            raise RuntimeError(f"SQLite foreign-key violations found: {violations[:20]}")


def sqlite_tables(db: sqlite3.Connection) -> list[str]:
    return [
        row[0]
        for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).fetchall()
    ]


def sqlite_columns(db: sqlite3.Connection, table: str) -> list[str]:
    return [row[1] for row in db.execute(f"PRAGMA table_info({_quote_ident(table)})").fetchall()]


def pg_tables(db) -> list[str]:
    return [
        row[0]
        for row in db.execute(
            """
            SELECT table_name
              FROM information_schema.tables
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
             ORDER BY table_name
            """
        ).fetchall()
    ]


def pg_columns(db, table: str) -> list[str]:
    return [
        row[0]
        for row in db.execute(
            """
            SELECT column_name
              FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = %s
             ORDER BY ordinal_position
            """,
            (table,),
        ).fetchall()
    ]


def copy_order(db) -> list[str]:
    """Return target tables in a order that satisfies foreign keys."""
    rows = db.execute(
        """
        SELECT
            tc.table_name AS table_name,
            ccu.table_name AS references_table
          FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
           AND ccu.table_schema = tc.table_schema
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_schema = 'public'
        """
    ).fetchall()
    dependencies: dict[str, set[str]] = {table: set() for table in pg_tables(db)}
    for row in rows:
        table, ref = row["table_name"], row["references_table"]
        if table != ref:
            dependencies.setdefault(table, set()).add(ref)
    ordered: list[str] = []
    temporary: set[str] = set()
    permanent: set[str] = set()

    def visit(name: str, stack: list[str] | None = None) -> None:
        stack = (stack or []) + [name]
        if name in permanent:
            return
        if name in temporary:
            cycle = " -> ".join(stack[stack.index(name):] + [name])
            raise RuntimeError(f"Cyclic foreign keys prevent automatic copy order: {cycle}")
        temporary.add(name)
        for ref in sorted(dependencies.get(name, set())):
            visit(ref, stack)
        temporary.remove(name)
        permanent.add(name)
        ordered.append(name)

    for table in sorted(dependencies):
        visit(table)
    return ordered


def table_count(db, table: str) -> int:
    return int(db.execute(f"SELECT COUNT(*) AS count FROM {_quote_ident(table)}").fetchone()["count"])


def reset_sequences(db) -> None:
    tables = pg_tables(db)
    for table in tables:
        columns = pg_columns(db, table)
        if "id" not in columns:
            continue
        db.execute(
            f"""
            SELECT setval(
                pg_get_serial_sequence(%s, 'id'),
                COALESCE((SELECT MAX(id) FROM {_quote_ident(table)}), 1),
                COALESCE((SELECT MAX(id) IS NOT NULL FROM {_quote_ident(table)}), false)
            )
            WHERE pg_get_serial_sequence(%s, 'id') IS NOT NULL
            """,
            (table, table),
        )


def migrate(source: Path, *, truncate: bool, batch_size: int) -> dict[str, dict[str, int]]:
    # Import after the caller has supplied TRADESYNC_DATABASE_URL.
    from app.db import connect_db
    from app.migrations import SCHEMA_VERSION, upgrade_database

    check_sqlite(source)
    backup = backup_sqlite(source, BACKEND_ROOT / "backups")
    print(f"SQLite backup verified: {backup}")

    upgrade_database()
    pg = connect_db(autocommit=False, application_name="tradesync-sqlite-migration")
    summary: dict[str, dict[str, int]] = {}
    try:
        target_tables = set(pg_tables(pg))
        if truncate:
            all_targets = ", ".join(_quote_ident(table) for table in sorted(target_tables - {'alembic_version'}))
            if all_targets:
                pg.execute(f"TRUNCATE TABLE {all_targets} RESTART IDENTITY CASCADE")
        else:
            occupied = {
            table: table_count(pg, table)
            for table in target_tables - {'alembic_version'}
            if table_count(pg, table)
        }
            if occupied:
                raise RuntimeError(
                    "PostgreSQL tables already contain data; rerun with --truncate-target to replace it: "
                    + ", ".join(f"{table}={count}" for table, count in occupied.items())
                )

        with sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True) as sqlite_db:
            sqlite_db.row_factory = sqlite3.Row
            source_tables = set(sqlite_tables(sqlite_db))
            for table in copy_order(pg):
                if table == "alembic_version" or table not in source_tables:
                    continue
                source_columns = sqlite_columns(sqlite_db, table)
                target_columns = [column for column in pg_columns(pg, table) if column in source_columns]
                if not target_columns:
                    continue
                source_count = sqlite_db.execute(
                    f"SELECT COUNT(*) FROM {_quote_ident(table)}"
                ).fetchone()[0]
                columns_sql = ", ".join(_quote_ident(column) for column in target_columns)
                placeholders = ", ".join(["%s"] * len(target_columns))
                insert_sql = (
                    f"INSERT INTO {_quote_ident(table)} ({columns_sql}) "
                    f"VALUES ({placeholders})"
                )
                cursor = sqlite_db.execute(
                    f"SELECT {columns_sql} FROM {_quote_ident(table)}"
                )
                while True:
                    rows = cursor.fetchmany(batch_size)
                    if not rows:
                        break
                    values: list[tuple[Any, ...]] = [tuple(row) for row in rows]
                    pg.executemany(insert_sql, values)
                target_count = table_count(pg, table)
                if target_count != source_count:
                    raise RuntimeError(
                        f"Row count mismatch for {table}: sqlite={source_count}, postgresql={target_count}"
                    )
                summary[table] = {"sqlite": source_count, "postgresql": target_count}

        reset_sequences(pg)
        revision = pg.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
        if revision is None or revision[0] != SCHEMA_VERSION:
            raise RuntimeError("Target schema revision is not correct after data migration")
        pg.commit()
    except Exception:
        pg.rollback()
        raise
    finally:
        pg.close()
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, default=BACKEND_ROOT / "data" / "tradesync.db")
    parser.add_argument("--truncate-target", action="store_true", help="replace existing PostgreSQL data")
    parser.add_argument("--batch-size", type=int, default=500)
    args = parser.parse_args()
    if not args.sqlite.exists():
        raise SystemExit(f"SQLite database not found: {args.sqlite}")
    summary = migrate(args.sqlite, truncate=args.truncate_target, batch_size=args.batch_size)
    total = sum(item["sqlite"] for item in summary.values())
    print(f"Migrated {len(summary)} tables, {total} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
