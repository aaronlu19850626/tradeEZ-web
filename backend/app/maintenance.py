"""PostgreSQL maintenance helpers used by operational scripts."""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit

from .db import connect_db
from .migrations import SCHEMA_VERSION


def resolve_database_url(url: str | None = None) -> str:
    resolved = (url or os.getenv("TRADESYNC_DATABASE_URL", "")).strip()
    if not resolved:
        raise RuntimeError("TRADESYNC_DATABASE_URL is required")
    return resolved.replace("postgresql+psycopg://", "postgresql://", 1)


def _parse_postgres_url(url: str) -> dict[str, str | int | None]:
    parsed = urlsplit(resolve_database_url(url))
    if parsed.scheme != "postgresql":
        raise RuntimeError("Database URL must start with postgresql://")
    query = parse_qs(parsed.query)
    return {
        "host": parsed.hostname or "127.0.0.1",
        "port": parsed.port or 5432,
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "dbname": parsed.path.lstrip("/") or "postgres",
        "sslmode": query.get("sslmode", ["prefer"])[0],
    }


def _pq_env(url: str, *, dbname: str | None = None) -> dict[str, str]:
    parts = _parse_postgres_url(url)
    env = os.environ.copy()
    env.update(
        {
            "PGHOST": str(parts["host"]),
            "PGPORT": str(parts["port"]),
            "PGUSER": str(parts["user"]),
            "PGPASSWORD": str(parts["password"]),
            "PGDATABASE": dbname or str(parts["dbname"]),
            "PGSSLMODE": str(parts["sslmode"]),
            "PGCONNECT_TIMEOUT": "15",
        }
    )
    return env


def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _foreign_key_violations(db, *, sample_limit: int = 100) -> list[dict[str, Any]]:
    foreign_keys = db.execute(
        """
        SELECT
            tc.table_schema AS schema_name,
            tc.table_name AS table_name,
            tc.constraint_name AS constraint_name,
            kcu.column_name AS column_name,
            ccu.table_schema AS foreign_schema,
            ccu.table_name AS foreign_table,
            ccu.column_name AS foreign_column
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
           AND ccu.table_schema = tc.table_schema
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_schema = current_schema()
           AND ccu.table_schema = current_schema()
         ORDER BY tc.table_schema, tc.table_name, tc.constraint_name, kcu.ordinal_position
        """
    ).fetchall()

    grouped: dict[tuple[str, str, str, str, str], list[tuple[str, str]]] = {}
    for row in foreign_keys:
        key = (
            row["schema_name"], row["table_name"], row["foreign_schema"],
            row["foreign_table"], row["constraint_name"],
        )
        grouped.setdefault(key, []).append((row["column_name"], row["foreign_column"]))

    violations: list[dict[str, Any]] = []
    for (schema_name, table_name, foreign_schema, foreign_table, _), columns in grouped.items():
        on_clause = " AND ".join(
            f"f.{_quote_ident(fcol)} = t.{_quote_ident(col)}"
            for col, fcol in columns
        )
        nullable = " OR ".join(
            f"t.{_quote_ident(col)} IS NOT NULL"
            for col, _ in columns
        )
        statement = f"""
            SELECT COUNT(*) AS violation_count
              FROM {_quote_ident(schema_name)}.{_quote_ident(table_name)} t
              LEFT JOIN {_quote_ident(foreign_schema)}.{_quote_ident(foreign_table)} f ON {on_clause}
             WHERE {nullable} AND f.{_quote_ident(columns[0][1])} IS NULL
        """
        count_row = db.execute(statement).fetchone()
        count = int(count_row["violation_count"]) if count_row else 0
        if count:
            sample = db.execute(
                f"""
                SELECT t.*
                  FROM {_quote_ident(schema_name)}.{_quote_ident(table_name)} t
                  LEFT JOIN {_quote_ident(foreign_schema)}.{_quote_ident(foreign_table)} f ON {on_clause}
                 WHERE {nullable} AND f.{_quote_ident(columns[0][1])} IS NULL
                 LIMIT %s
                """,
                (sample_limit,),
            ).fetchall()
            violations.append(
                {
                    "table": f"{schema_name}.{table_name}",
                    "foreign_table": f"{foreign_schema}.{foreign_table}",
                    "columns": columns,
                    "count": count,
                    "sample": [dict(row) for row in sample],
                }
            )
    return violations


def check_database(url: str | None = None, *, quick: bool = False) -> dict[str, Any]:
    """Check connectivity, revision and, unless quick, foreign-key consistency."""
    resolved_url = resolve_database_url(url)
    db = connect_db(autocommit=True, application_name="tradesync-db-check")
    try:
        db.execute("SELECT 1").fetchone()
        revision_row = db.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
        revision = revision_row[0] if revision_row is not None else None
        report: dict[str, Any] = {
            "ok": revision == SCHEMA_VERSION,
            "database": _parse_postgres_url(resolved_url)["dbname"],
            "revision": revision,
            "expected_revision": SCHEMA_VERSION,
        }
        if not quick:
            report["foreign_key_violations"] = _foreign_key_violations(db)
            report["ok"] = report["ok"] and not report["foreign_key_violations"]
        return report
    finally:
        db.close()


def backup_database(destination: str | Path, source_url: str | None = None) -> dict[str, Any]:
    """Create a pg_dump custom-format backup."""
    if shutil.which("pg_dump") is None:
        raise RuntimeError("pg_dump was not found; install PostgreSQL client tools")
    source = resolve_database_url(source_url)
    destination_path = Path(destination).resolve()
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    with destination_path.open("xb"):
        pass
    try:
        subprocess.run(
            [
                "pg_dump",
                "--format=custom",
                "--no-owner",
                "--no-privileges",
                f"--file={destination_path}",
            ],
            env=_pq_env(source),
            check=True,
            capture_output=True,
            text=True,
        )
        if shutil.which("pg_restore"):
            subprocess.run(
                ["pg_restore", "--list", str(destination_path)],
                env=_pq_env(source),
                check=True,
                capture_output=True,
                text=True,
            )
        return {"backup": str(destination_path), "database": _parse_postgres_url(source)["dbname"]}
    except Exception:
        destination_path.unlink(missing_ok=True)
        raise


def restore_database(
    backup: str | Path,
    target_url: str | None = None,
    *,
    assume_yes: bool = False,
) -> dict[str, Any]:
    """Restore a custom-format backup by dropping and recreating the target database."""
    if shutil.which("pg_restore") is None:
        raise RuntimeError("pg_restore was not found; install PostgreSQL client tools")
    backup_path = Path(backup).resolve(strict=True)
    target = resolve_database_url(target_url)
    target_parts = _parse_postgres_url(target)
    target_name = str(target_parts["dbname"])
    if target_name in {"postgres", "template0", "template1"}:
        raise ValueError("Refusing to restore a PostgreSQL maintenance database")
    if not assume_yes and os.getenv("TRADESYNC_CONFIRM_RESTORE", "").lower() not in {"1", "true", "yes"}:
        raise RuntimeError("Refusing to restore without assume_yes=True or TRADESYNC_CONFIRM_RESTORE=1")

    maintenance_env = _pq_env(target, dbname="postgres")
    subprocess.run(
        [
            "pg_restore",
            "--create",
            "--clean",
            "--if-exists",
            "--no-owner",
            "--no-privileges",
            "--exit-on-error",
            str(backup_path),
        ],
        env=maintenance_env,
        check=True,
        capture_output=True,
        text=True,
    )
    report = check_database(target, quick=True)
    report["restored"] = target_name
    return report
