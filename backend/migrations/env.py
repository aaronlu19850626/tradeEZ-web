from __future__ import annotations

from sqlalchemy import create_engine, pool

from alembic import context

from app.config import get_settings


def _database_url() -> str:
    url = get_settings().database_url.strip()
    if not url:
        raise RuntimeError("TRADESYNC_DATABASE_URL is required")
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("postgresql+psycopg://"):
        return url
    raise RuntimeError("Alembic requires a PostgreSQL TRADESYNC_DATABASE_URL")


def run(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=None,
        transactional_ddl=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    context.configure(url=_database_url(), literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()
else:
    connection = context.config.attributes.get("connection")
    if connection is not None:
        run(connection)
    else:
        engine = create_engine(_database_url(), poolclass=pool.NullPool)
        try:
            with engine.begin() as live_connection:
                run(live_connection)
        finally:
            engine.dispose()
