from __future__ import annotations

from datetime import datetime, timezone

from app.timekeeping import resolve_trade_times
from helpers import make_account


def _server_epoch(year: int, month: int, day: int, hour: int) -> int:
    return int(datetime(year, month, day, hour, tzinfo=timezone.utc).timestamp())


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
