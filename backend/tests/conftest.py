"""Shared pytest configuration for PostgreSQL-backed tests."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

import psycopg
import pytest
from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

load_dotenv(BACKEND_ROOT / ".env", override=False)

TEST_SCHEMA = "tradesync_test"


def _replace_schema(url: str, schema: str) -> str:
    parts = urlsplit(url)
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key != "options"]
    query.append(("options", f"-c search_path={schema}"))
    return urlunsplit((parts.scheme, parts.netloc, parts.path or "/tradeez", urlencode(query, quote_via=quote), parts.fragment))


def test_database_url() -> str:
    explicit = os.getenv("TRADESYNC_TEST_DATABASE_URL", "").strip()
    if explicit:
        return explicit
    source = os.getenv("TRADESYNC_DATABASE_URL", "").strip()
    if not source:
        raise RuntimeError("TRADESYNC_DATABASE_URL is required to provision the isolated test schema")
    return _replace_schema(source, TEST_SCHEMA)


def reset_test_schema(url: str) -> None:
    with psycopg.connect(url, autocommit=True, connect_timeout=10) as db:
        db.execute(f"DROP SCHEMA IF EXISTS {TEST_SCHEMA} CASCADE")
        db.execute(f"CREATE SCHEMA {TEST_SCHEMA}")
        db.execute(f"GRANT ALL ON SCHEMA {TEST_SCHEMA} TO public")


@pytest.fixture(scope="session")
def pg_client():
    try:
        url = test_database_url()
        os.environ["TRADESYNC_DATABASE_URL"] = url
        reset_test_schema(url)
    except (psycopg.Error, OSError, RuntimeError) as exc:
        pytest.skip(f"PostgreSQL test schema is unavailable: {exc}")

    from app.config import get_settings
    from app.main import app
    from app.migrations import upgrade_database

    get_settings.cache_clear()
    upgrade_database()

    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        yield client


@pytest.fixture(scope="session")
def pg_db(pg_client):
    from app.db import connect_db

    connection = connect_db(autocommit=True, application_name="pytest-db")
    try:
        yield connection
    finally:
        connection.close()
