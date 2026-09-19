from contextlib import closing, contextmanager
from pathlib import Path
import sqlite3
import tempfile
import os
import subprocess
import sys

import pytest
from alembic import command
from alembic.script import ScriptDirectory

from app.db import init_db
from app.migrations import migration_config, migration_engine


def current_head() -> str:
    return ScriptDirectory.from_config(migration_config()).get_current_head()


@contextmanager
def connection_to(path):
    with closing(sqlite3.connect(path)) as connection:
        with connection:
            yield connection


@pytest.fixture
def database():
    with tempfile.TemporaryDirectory(prefix="tradesync-migrations-") as directory:
        yield Path(directory) / "db.sqlite"


def legacy_database(path):
    with connection_to(path) as conn:
        conn.executescript((Path(__file__).parent / "fixtures/legacy_schema.sql").read_text(encoding="utf-8"))
        conn.execute("INSERT INTO users(id,email) VALUES(1,'migration@example.com')")
        conn.execute("INSERT INTO accounts(id,user_id,mt5_login,key_prefix,key_hash,server_gmt_off) VALUES(1,1,123,'prefix','hash',0)")
        conn.execute("INSERT INTO deals(account_login,ticket,volume,price,deal_time,server_gmt_off,raw_json) VALUES(123,456,1,2,1000,3600,'{}')")


def test_empty_database_has_version_and_sync_constraints(database):
    init_db(str(database))
    with connection_to(database) as conn:
        assert conn.execute("SELECT version_num FROM alembic_version").fetchone()[0] == current_head()
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert {"accounts", "deals", "ea_instances", "sync_runs", "sync_batches", "sync_batch_refs", "review_versions"} <= tables
        assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert conn.execute("PRAGMA foreign_key_check").fetchall() == []


def test_legacy_upgrade_preserves_rows_and_adds_missing_fields(database):
    legacy_database(database)
    init_db(str(database))
    with connection_to(database) as conn:
        assert conn.execute("SELECT ticket,price,open_time,server_gmt_off FROM deals").fetchone() == (456, 2, 1000, 0)
        assert conn.execute("SELECT key_hash,status,last_sync_time,server_gmt_off FROM accounts").fetchone() == ("hash", "active", 0, None)
        assert conn.execute("SELECT email FROM users").fetchone()[0] == "migration@example.com"


def test_repeated_start_does_not_repeat_data_repair(database):
    legacy_database(database)
    init_db(str(database))
    with connection_to(database) as conn:
        conn.execute("UPDATE deals SET open_time=0,server_gmt_off=123")
    init_db(str(database))
    with connection_to(database) as conn:
        assert conn.execute("SELECT open_time,server_gmt_off FROM deals").fetchone() == (0, 123)
        assert conn.execute("SELECT COUNT(*) FROM alembic_version").fetchone()[0] == 1


def test_failed_adoption_rolls_back_ddl_and_version(database):
    legacy_database(database)
    with connection_to(database) as conn:
        conn.execute("CREATE TRIGGER reject_repair BEFORE UPDATE ON deals BEGIN SELECT RAISE(ABORT, 'injected migration failure'); END")
    with pytest.raises(Exception, match="injected migration failure"):
        init_db(str(database))
    with connection_to(database) as conn:
        assert "open_time" not in {r[1] for r in conn.execute("PRAGMA table_info(deals)")}
        assert conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE name IN ('alembic_version','sync_runs')").fetchone()[0] == 0
        assert conn.execute("SELECT server_gmt_off FROM accounts").fetchone()[0] == 0
        conn.execute("DROP TRIGGER reject_repair")
    init_db(str(database))


def test_unknown_revision_is_not_silently_stamped(database):
    init_db(str(database))
    with connection_to(database) as conn:
        conn.execute("UPDATE alembic_version SET version_num='future_unknown'")
    with pytest.raises(Exception, match="future_unknown"):
        init_db(str(database))
    with connection_to(database) as conn:
        assert conn.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "future_unknown"


def test_baseline_downgrade_refuses_data_loss(database):
    legacy_database(database)
    init_db(str(database))
    engine = migration_engine(str(database))
    try:
        with pytest.raises(RuntimeError, match="restore"):
            with engine.begin() as connection:
                config = migration_config()
                config.attributes["connection"] = connection
                command.downgrade(config, "base")
    finally:
        engine.dispose()
    with connection_to(database) as conn:
        assert conn.execute("SELECT COUNT(*) FROM deals").fetchone()[0] == 1
        assert conn.execute("SELECT version_num FROM alembic_version").fetchone()[0] == current_head()


def test_backup_contains_wal_data_and_restores_legacy_database(database):
    from scripts.backup_database import backup_database

    legacy_database(database)
    destination = database.with_name("before-upgrade.sqlite")
    with connection_to(database) as writer:
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute("UPDATE users SET last_login_at='backup-marker'")
        writer.commit()
        backup_database(database, destination)
    init_db(str(database))
    with connection_to(destination) as restored:
        assert restored.execute("SELECT last_login_at FROM users").fetchone()[0] == "backup-marker"
        assert restored.execute("SELECT COUNT(*) FROM sqlite_master WHERE name='alembic_version'").fetchone()[0] == 0
        assert restored.execute("SELECT ticket FROM deals").fetchone()[0] == 456
    with pytest.raises(FileExistsError):
        backup_database(database, destination)
    init_db(str(destination))


@pytest.mark.parametrize("attempt", range(5))
def test_concurrent_cli_upgrades_apply_one_baseline(database, attempt):
    backend = Path(__file__).resolve().parents[1]
    env = {**os.environ, "TRADESYNC_DB_PATH": str(database)}
    processes = [subprocess.Popen(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=backend, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    ) for _ in range(2)]
    try:
        for process in processes:
            stdout, stderr = process.communicate(timeout=30)
            assert process.returncode == 0, (stdout.decode(errors="replace"), stderr.decode(errors="replace"))
    finally:
        for process in processes:
            if process.poll() is None:
                process.kill()
                process.wait()
    with connection_to(database) as conn:
        assert conn.execute("SELECT version_num FROM alembic_version").fetchall() == [(current_head(),)]


