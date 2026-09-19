from alembic import context

from app.config import get_settings
from app.migrations import migration_engine


def run(connection):
    context.configure(connection=connection, target_metadata=None, transactional_ddl=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    raise RuntimeError("Legacy adoption requires a live SQLite connection; --sql is not supported.")

connection = context.config.attributes.get("connection")
if connection is not None:
    run(connection)
else:
    engine = migration_engine(get_settings().db_path)
    try:
        with engine.begin() as connection:
            run(connection)
    finally:
        engine.dispose()
