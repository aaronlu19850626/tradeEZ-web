from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from helpers import signed_post, web_headers

PLATFORM_TZ = ZoneInfo("Asia/Shanghai")


def bj_epoch(day: str, hour: int = 0, minute: int = 0) -> int:
    dt = datetime.fromisoformat(f"{day}T{hour:02d}:{minute:02d}:00")
    return int(dt.replace(tzinfo=PLATFORM_TZ).timestamp())


def create_account(client, headers, login: int, name: str | None = None) -> dict:
    response = client.post(
        "/api/v1/accounts",
        headers=headers,
        json={"name": name or f"MT5 {login}", "mt5_login": login, "sync_start_date": "2026-01-01"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _deal(ticket: int, *, position: int, entry: int, deal_type: int, open_time: int, deal_time: int, **overrides) -> dict:
    payload = {
        "ticket": ticket,
        "position_id": position,
        "order_id": ticket + 100000,
        "symbol": "XAUUSD",
        "entry": entry,
        "type": deal_type,
        "volume": 0.1,
        "price": 2010.0,
        "sl_price": 1990.0,
        "tp_price": 2020.0,
        "profit": 0.0,
        "swap": 0.0,
        "commission": 0.0,
        "magic": 920717,
        "comment": "test",
        "open_time": open_time,
        "deal_time": deal_time,
    }
    payload.update(overrides)
    return payload


def _ingest(client, key: str, login: int, deals: list[dict]) -> None:
    response = signed_post(client, "/api/v1/ingest/deals", key, {"mt5_login": login, "deals": deals})
    assert response.status_code == 200, response.text


def _add_symbol(db, login: int, symbol: str = "XAUUSD", point: float = 0.01, contract_size: float = 100.0) -> None:
    db.execute(
        """
        INSERT INTO symbols (account_login, symbol, digits, point, contract_size, tick_value, tick_size, currency_base, currency_profit, raw_json)
        VALUES (%s, %s, 2, %s, %s, 1.0, %s, 'XAU', 'USD', '{}')
        ON CONFLICT (account_login, symbol) DO NOTHING
        """,
        (login, symbol, point, contract_size, point),
    )
    db.commit()


def _closed_trade(account: dict, position: int, open_day: str, close_day: str, *, side: int = 0, profit: float = 100.0, symbol: str = "XAUUSD", open_price: float = 2000.0, close_price: float = 2010.0, sl_price: float = 1990.0) -> list[dict]:
    open_time = bj_epoch(open_day, 9)
    close_time = bj_epoch(close_day, 15)
    return [
        _deal(position * 2, position=position, entry=0, deal_type=side, open_time=open_time, deal_time=open_time, price=open_price, symbol=symbol, sl_price=sl_price),
        _deal(position * 2 + 1, position=position, entry=1, deal_type=side, open_time=open_time, deal_time=close_time, price=close_price, symbol=symbol, sl_price=sl_price, profit=profit, commission=-5.0),
    ]


def test_list_returns_closed_trades_desc(client, db):
    headers = web_headers(db, "trade-list@example.com")
    account = create_account(client, headers, 921001)
    _add_symbol(db, 921001)
    deals = _closed_trade(account, 921001, "2026-09-14", "2026-09-15", profit=100.0)
    deals += _closed_trade(account, 921002, "2026-09-15", "2026-09-16", side=1, profit=-30.0)
    _ingest(client, account["sync_key"], 921001, deals)

    response = client.get("/api/v1/trades", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 2
    first, second = body["items"]
    assert first["closeTime"] > second["closeTime"]
    assert first["netPnl"] == -35.0 and first["openPrice"] == 2000.0 and first["closePrice"] == 2010.0
    assert first["side"] == "sell"
    assert first["accountLogin"] == "921001"
    assert first["rMultiple"] == -0.35
    assert first["points"] == -1000.0
    assert second["side"] == "buy" and second["netPnl"] == 95.0 and second["rMultiple"] == 0.95


def test_summary_stats(client, db):
    headers = web_headers(db, "trade-summary@example.com")
    account = create_account(client, headers, 921002)
    _add_symbol(db, 921002)
    deals = _closed_trade(account, 921003, "2026-09-14", "2026-09-15", profit=100.0)
    deals += _closed_trade(account, 921004, "2026-09-15", "2026-09-16", profit=50.0)
    deals += _closed_trade(account, 921005, "2026-09-16", "2026-09-17", side=1, profit=-20.0)
    _ingest(client, account["sync_key"], 921002, deals)

    body = client.get("/api/v1/trades/summary", headers=headers).json()
    stats = body["stats"]
    assert stats["count"] == 3
    assert stats["winners"] == 2 and stats["losers"] == 1
    assert stats["net"] == 115.0
    assert stats["profitFactor"] == 5.6
    assert stats["avgWin"] == 70.0 and stats["avgLoss"] == 25.0
    assert stats["winRate"] == 2 / 3
    assert len(body["series"]) == 4
    assert body["series"][-1]["value"] == 115.0


def test_filters_and_range(client, db):
    headers = web_headers(db, "trade-filters@example.com")
    account = create_account(client, headers, 921003)
    _add_symbol(db, 921003)
    _add_symbol(db, 921003, symbol="EURUSD", point=0.0001, contract_size=100000.0)
    deals = _closed_trade(account, 921006, "2026-08-01", "2026-08-02", side=0, profit=100.0, symbol="XAUUSD")
    deals += _closed_trade(account, 921007, "2026-09-01", "2026-09-02", side=1, profit=-20.0, symbol="EURUSD", open_price=1.08, close_price=1.07, sl_price=1.09)
    _ingest(client, account["sync_key"], 921003, deals)

    assert client.get("/api/v1/trades", headers=headers, params={"side": "buy"}).json()["total"] == 1
    assert client.get("/api/v1/trades", headers=headers, params={"result": "win"}).json()["total"] == 1
    assert client.get("/api/v1/trades", headers=headers, params={"symbol": "EURUSD"}).json()["total"] == 1
    assert client.get("/api/v1/trades", headers=headers, params={"from_day": "2026-09-01", "to_day": "2026-09-30"}).json()["total"] == 1
    assert client.get("/api/v1/trades", headers=headers, params={"from_day": "2026-01-01", "to_day": "2026-01-31"}).json()["total"] == 0


def test_account_scope_default_statistics(client, db):
    headers = web_headers(db, "trade-scope@example.com")
    stat = create_account(client, headers, 921004)
    hidden = create_account(client, headers, 921005)
    client.patch(f"/api/v1/accounts/{hidden['id']}", headers=headers, json={"is_statistics": False})
    _add_symbol(db, 921004)
    _add_symbol(db, 921005)
    _ingest(client, stat["sync_key"], 921004, _closed_trade(stat, 921008, "2026-09-01", "2026-09-02", profit=10.0))
    _ingest(client, hidden["sync_key"], 921005, _closed_trade(hidden, 921009, "2026-09-01", "2026-09-02", profit=90.0))

    assert client.get("/api/v1/trades/summary", headers=headers).json()["stats"]["count"] == 1
    explicit = client.get("/api/v1/trades/summary", headers=headers, params={"account_ids": f"{stat['id']},{hidden['id']}"})
    assert explicit.json()["stats"]["count"] == 2


def test_groups_day_and_week(client, db):
    headers = web_headers(db, "trade-groups@example.com")
    account = create_account(client, headers, 921006)
    _add_symbol(db, 921006)
    deals = _closed_trade(account, 921010, "2026-09-14", "2026-09-15", profit=10.0)
    deals += _closed_trade(account, 921011, "2026-09-16", "2026-09-16", profit=20.0)
    _ingest(client, account["sync_key"], 921006, deals)

    day_groups = client.get("/api/v1/trades/groups", headers=headers, params={"view": "day"}).json()
    assert [group["key"] for group in day_groups] == ["2026-09-16", "2026-09-15"]
    assert day_groups[0]["stats"]["count"] == 1

    week_groups = client.get("/api/v1/trades/groups", headers=headers, params={"view": "week"}).json()
    assert len(week_groups) == 1 and week_groups[0]["key"] == "2026-09-14"
    assert week_groups[0]["startDay"] == "2026-09-15" and week_groups[0]["endDay"] == "2026-09-16"


def test_calendar_and_symbols(client, db):
    headers = web_headers(db, "trade-calendar@example.com")
    account = create_account(client, headers, 921007)
    _add_symbol(db, 921007)
    _add_symbol(db, 921007, symbol="EURUSD", point=0.0001, contract_size=100000.0)
    deals = _closed_trade(account, 921012, "2026-09-14", "2026-09-15", profit=30.0, symbol="EURUSD", open_price=1.08, close_price=1.07, sl_price=1.09)
    _ingest(client, account["sync_key"], 921007, deals)

    days = client.get("/api/v1/trades/calendar", headers=headers, params={"month": "2026-09"}).json()
    assert days == [{"day": "2026-09-15", "net": 25.0, "count": 1}]
    assert sorted(client.get("/api/v1/trades/symbols", headers=headers).json()) == ["EURUSD"]


def test_pagination_and_sort(client, db):
    headers = web_headers(db, "trade-page@example.com")
    account = create_account(client, headers, 921008)
    _add_symbol(db, 921008)
    deals = _closed_trade(account, 921013, "2026-09-14", "2026-09-15", profit=10.0)
    deals += _closed_trade(account, 921014, "2026-09-15", "2026-09-16", profit=20.0)
    deals += _closed_trade(account, 921015, "2026-09-16", "2026-09-17", profit=30.0)
    _ingest(client, account["sync_key"], 921008, deals)

    page = client.get("/api/v1/trades", headers=headers, params={"page": 2, "page_size": 2}).json()
    assert page["total"] == 3 and len(page["items"]) == 1
    asc = client.get("/api/v1/trades", headers=headers, params={"sort": "net", "order": "asc"}).json()
    assert [item["netPnl"] for item in asc["items"]] == [5.0, 15.0, 25.0]


def test_ownership_isolation(client, db):
    owner = web_headers(db, "trade-owner@example.com")
    stranger = web_headers(db, "trade-stranger@example.com")
    account = create_account(client, owner, 921009)
    _add_symbol(db, 921009)
    _ingest(client, account["sync_key"], 921009, _closed_trade(account, 921016, "2026-09-01", "2026-09-02", profit=10.0))

    assert client.get("/api/v1/trades", headers=stranger).json()["total"] == 0
    assert client.get("/api/v1/trades/summary", headers=stranger).json()["stats"]["count"] == 0
    assert client.get("/api/v1/trades", headers=stranger, params={"account_ids": str(account["id"])}).status_code == 404
