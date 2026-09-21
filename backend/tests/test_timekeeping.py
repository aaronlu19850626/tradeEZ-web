from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from app.timekeeping import (
    _server_time_to_utc,
    observe_timezone_candidate,
    resolve_trade_times,
    schedule_timezone_backfill,
)
from helpers import deal, make_account, signed_post


def _server_epoch(year: int, month: int, day: int, hour: int) -> int:
    return int(datetime(year, month, day, hour, tzinfo=timezone.utc).timestamp())


def _expected_utc(timezone_name: str, year: int, month: int, day: int, hour: int) -> int:
    local = datetime(year, month, day, hour).replace(tzinfo=ZoneInfo(timezone_name))
    return int(local.timestamp())


def test_iana_timezone_profile_handles_dst_automatically(client, db):
    login = 940001
    make_account(db, login)
    db.execute("UPDATE accounts SET broker_server=%s WHERE mt5_login=%s", ("XMGlobal-MT5 10", login))
    db.commit()
    account = db.execute("SELECT * FROM accounts WHERE mt5_login=%s", (login,)).fetchone()

    winter_server = _server_epoch(2026, 1, 15, 12)
    winter_open, winter_deal, profile_id = resolve_trade_times(
        db,
        account,
        {
            "open_time": winter_server,
            "deal_time": winter_server,
            "server_open_time": winter_server,
            "server_deal_time": winter_server,
            "server_gmt_offset": 7200,
        },
    )
    assert profile_id is not None
    assert winter_open == _server_epoch(2026, 1, 15, 10)
    assert winter_deal == winter_open

    summer_server = _server_epoch(2026, 7, 15, 12)
    summer_open, summer_deal, _ = resolve_trade_times(
        db,
        account,
        {
            "open_time": summer_server,
            "deal_time": summer_server,
            "server_open_time": summer_server,
            "server_deal_time": summer_server,
            "server_gmt_offset": 10800,
        },
    )
    assert summer_open == _server_epoch(2026, 7, 15, 9)
    assert summer_deal == summer_open


def test_unknown_broker_falls_back_to_observed_offset_and_records_candidate(client, db):
    login = 940002
    make_account(db, login)
    account = db.execute("SELECT * FROM accounts WHERE mt5_login=%s", (login,)).fetchone()
    server_time = _server_epoch(2026, 7, 15, 12)
    resolved_open, resolved_deal, profile_id = resolve_trade_times(
        db,
        account,
        {
            "open_time": server_time,
            "deal_time": server_time,
            "server_open_time": server_time,
            "server_deal_time": server_time,
            "server_gmt_offset": 7200,
        },
    )
    assert profile_id is None
    assert resolved_open == resolved_deal == _server_epoch(2026, 7, 15, 10)
    candidate = db.execute(
        "SELECT broker_server, observed_offset_seconds FROM broker_timezone_candidates WHERE broker_server=%s",
        ("Test-Server",),
    ).fetchone()
    assert candidate is not None
    assert int(candidate["observed_offset_seconds"]) == 7200


def test_known_broker_schedules_automatic_backfill(client, db):
    login = 940003
    token = make_account(db, login)
    inserted = signed_post(
        client,
        "/api/v1/ingest/deals",
        token,
        {
            "mt5_login": login,
            "deals": [
                deal(
                    9400031,
                    position=940003,
                    entry=0,
                    deal_type=0,
                    open_time=1_800_000_000,
                    deal_time=1_800_000_000,
                )
            ],
        },
    )
    assert inserted.status_code == 200, inserted.text
    db.execute("UPDATE accounts SET broker_server=%s WHERE mt5_login=%s", ("XMGlobal-MT5 10", login))
    db.execute(
        """
        INSERT INTO connector_connections (
            connection_id, account_id, platform, account_ref, instance_id,
            connector_version, cursor_value
        ) VALUES (%s, (SELECT id FROM accounts WHERE mt5_login=%s), 'mt5', %s, 'timezone-test', '2.0.1', 12345)
        """,
        ("cn_timezone_backfill", login, str(login)),
    )
    db.commit()
    account = db.execute("SELECT * FROM accounts WHERE mt5_login=%s", (login,)).fetchone()
    assert schedule_timezone_backfill(db, account) is True
    db.commit()
    refreshed = db.execute(
        "SELECT timezone_backfill_required, last_sync_time FROM accounts WHERE mt5_login=%s",
        (login,),
    ).fetchone()
    assert int(refreshed["timezone_backfill_required"]) == 1
    assert int(refreshed["last_sync_time"]) == 0
    connection = db.execute(
        "SELECT cursor_value FROM connector_connections WHERE account_id=(SELECT id FROM accounts WHERE mt5_login=%s)",
        (login,),
    ).fetchone()
    assert int(connection["cursor_value"]) == 0


def test_known_broker_automatically_renormalizes_existing_raw_times(client, db):
    login = 940004
    token = make_account(db, login)
    server_time = _server_epoch(2026, 7, 15, 12)
    inserted = signed_post(
        client,
        "/api/v1/ingest/deals",
        token,
        {
            "mt5_login": login,
            "deals": [
                {
                    **deal(
                        9400041,
                        position=940004,
                        entry=0,
                        deal_type=0,
                        open_time=server_time,
                        deal_time=server_time,
                    ),
                    "server_open_time": server_time,
                    "server_deal_time": server_time,
                    "server_gmt_offset": 10800,
                }
            ],
        },
    )
    assert inserted.status_code == 200, inserted.text
    db.execute("UPDATE accounts SET broker_server=%s WHERE mt5_login=%s", ("XMGlobal-MT5 10", login))
    db.commit()
    account = db.execute("SELECT * FROM accounts WHERE mt5_login=%s", (login,)).fetchone()
    assert schedule_timezone_backfill(db, account) is True
    db.commit()
    row = db.execute(
        "SELECT open_time, deal_time, timezone_profile_id FROM deals WHERE account_login=%s AND ticket=%s",
        (login, 9400041),
    ).fetchone()
    expected = _server_epoch(2026, 7, 15, 9)
    assert int(row["open_time"]) == expected
    assert int(row["deal_time"]) == expected
    assert row["timezone_profile_id"] is not None


def test_offset_samples_automatically_promote_dst_profile(client, db):
    login = 940005
    make_account(db, login)
    account = db.execute("SELECT * FROM accounts WHERE mt5_login=%s", (login,)).fetchone()
    observe_timezone_candidate(
        db,
        platform="mt5",
        broker_server="Test-Server",
        broker_company=None,
        observed_offset_seconds=7200,
    )
    observe_timezone_candidate(
        db,
        platform="mt5",
        broker_server="Test-Server",
        broker_company=None,
        observed_offset_seconds=10800,
    )
    profile = db.execute(
        "SELECT * FROM broker_timezone_profiles WHERE match_type='broker_server' AND match_value='Test-Server'"
    ).fetchone()
    assert profile is not None
    assert profile["timezone_name"] == "Europe/Athens"

    summer_server = _server_epoch(2026, 7, 15, 12)
    _, deal_time, profile_id = resolve_trade_times(
        db,
        account,
        {
            "open_time": summer_server,
            "deal_time": summer_server,
            "server_open_time": summer_server,
            "server_deal_time": summer_server,
            "server_gmt_offset": 10800,
        },
    )
    assert deal_time == _server_epoch(2026, 7, 15, 9)
    assert profile_id == int(profile["id"])


@pytest.mark.parametrize(
    ("timezone_name", "summer_before", "summer_after", "winter_before", "winter_after"),
    [
        ("Europe/Athens", (2026, 3, 28), (2026, 3, 30), (2026, 10, 24), (2026, 10, 26)),
        ("Europe/London", (2026, 3, 28), (2026, 3, 30), (2026, 10, 24), (2026, 10, 26)),
        ("America/New_York", (2026, 3, 7), (2026, 3, 9), (2026, 10, 31), (2026, 11, 2)),
        ("Australia/Sydney", (2026, 4, 4), (2026, 4, 6), (2026, 10, 3), (2026, 10, 5)),
    ],
)
def test_server_time_to_utc_respects_dst_boundaries(
    timezone_name,
    summer_before,
    summer_after,
    winter_before,
    winter_after,
):
    for date in (summer_before, summer_after, winter_before, winter_after):
        year, month, day = date
        server_time = _server_epoch(year, month, day, 12)
        assert _server_time_to_utc(server_time, timezone_name) == _expected_utc(
            timezone_name,
            year,
            month,
            day,
            12,
        )
