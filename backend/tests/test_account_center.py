from __future__ import annotations

import io
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date

import openpyxl
import pytest

from app.account_center.schemas import date_to_epoch
from helpers import deal, signed_post, web_headers

# Deals must fall inside the account's sync window: accounts are created with
# sync_start_date 2026-01-01 and the EA may look back 30 days from the cursor.
IN_WINDOW_EPOCH = 1_772_000_000  # 2026-02-25 UTC


def create_account(client, headers, login: int, name: str | None = None, **overrides):
    payload = {
        "name": name or f"MT5 {login}",
        "mt5_login": login,
        "sync_start_date": "2026-01-01",
    }
    payload.update(overrides)
    return client.post("/api/v1/accounts", headers=headers, json=payload)


def test_create_requires_name_and_valid_date(client, db):
    headers = web_headers(db, "create-validation@example.com")
    assert client.post("/api/v1/accounts", headers=headers, json={"mt5_login": 910001, "sync_start_date": "2026-01-01"}).status_code == 400
    assert create_account(client, headers, 910001, sync_start_date="2999-01-01").status_code == 400
    created = create_account(client, headers, 910001)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["name"] == "MT5 910001" and body["sync_key"].startswith("sk_live_")
    assert body["is_statistics"] is True and body["sync_start_date"] == "2026-01-01"


def test_ownership_isolation(client, db):
    owner = web_headers(db, "owner-isolation@example.com")
    stranger = web_headers(db, "stranger-isolation@example.com")
    account = create_account(client, owner, 910002).json()
    path = f"/api/v1/accounts/{account['id']}"
    assert client.get(path, headers=stranger).status_code == 404
    assert client.patch(path, headers=stranger, json={"name": "Hijack"}).status_code == 404
    assert client.post(path + "/regenerate-key", headers=stranger).status_code == 404
    assert client.get("/api/v1/accounts", headers=stranger).json() == []
    public = client.get(path, headers=owner).json()
    assert not {"sync_key", "key_hash", "key_encrypted"} & public.keys()


def test_statistics_toggle_and_rename(client, db):
    headers = web_headers(db, "statistics@example.com")
    first = create_account(client, headers, 910003).json()
    assert first["is_statistics"] is True
    path = f"/api/v1/accounts/{first['id']}"
    renamed = client.patch(path, headers=headers, json={"name": "主账户"})
    assert renamed.status_code == 200 and renamed.json()["name"] == "主账户"
    off = client.patch(path, headers=headers, json={"is_statistics": False})
    assert off.status_code == 200 and off.json()["is_statistics"] is False
    second = create_account(client, headers, 910004).json()
    assert second["is_statistics"] is False
    on = client.patch(path, headers=headers, json={"is_statistics": True})
    assert on.status_code == 200 and on.json()["is_statistics"] is True


def test_account_limit_is_ten(client, db):
    headers = web_headers(db, "limit@example.com")
    for login in range(910010, 910020):
        assert create_account(client, headers, login).status_code == 201
    assert create_account(client, headers, 910021).status_code == 400


def test_concurrent_same_login_returns_one_conflict(client, db):
    headers = web_headers(db, "concurrent-center@example.com")

    def create(_):
        return create_account(client, headers, 910030).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = list(executor.map(create, range(2)))
    assert sorted(statuses) == [201, 409]
    assert db.execute("SELECT COUNT(*) FROM accounts WHERE mt5_login=%s", (910030,)).fetchone()[0] == 1


def test_large_login_roundtrips_without_float(client, db):
    headers = web_headers(db, "large-center@example.com")
    login = 9007199254741009
    created = create_account(client, headers, login)
    assert created.status_code == 201, created.text
    assert created.json()["mt5_login"] == str(login)
    assert signed_post(client, "/api/v1/ingest/heartbeat", created.json()["sync_key"], {"mt5_login": login}).status_code == 200
    for invalid in (True, float(login), "9223372036854775808"):
        assert create_account(client, headers, invalid).status_code == 400


def test_sync_key_view_and_rotate_fences_old_key(client, db):
    headers = web_headers(db, "rotate-center@example.com")
    created = create_account(client, headers, 910040).json()
    path = f"/api/v1/accounts/{created['id']}"
    old_key = created["sync_key"]
    viewed = client.get(path + "/sync-key", headers=headers)
    assert viewed.status_code == 200 and viewed.json()["sync_key"] == old_key
    assert signed_post(client, "/api/v1/ingest/heartbeat", old_key, {"mt5_login": 910040}).status_code == 200
    rotated = client.post(path + "/regenerate-key", headers=headers)
    assert rotated.status_code == 200, rotated.text
    new_key = rotated.json()["sync_key"]
    assert new_key != old_key
    assert signed_post(client, "/api/v1/ingest/heartbeat", old_key, {"mt5_login": 910040}).status_code == 401
    assert signed_post(client, "/api/v1/ingest/heartbeat", new_key, {"mt5_login": 910040}).status_code == 200


def test_reset_clears_deals_keeps_key_and_statistics(client, db):
    headers = web_headers(db, "reset-center@example.com")
    account = create_account(client, headers, 910050).json()
    path = f"/api/v1/accounts/{account['id']}"
    key = account["sync_key"]
    rows = [deal(910050, position=910050, entry=0, deal_type=0, open_time=IN_WINDOW_EPOCH, deal_time=IN_WINDOW_EPOCH)]
    assert signed_post(client, "/api/v1/ingest/deals", key, {"mt5_login": 910050, "deals": rows}).status_code == 200
    assert client.get(path, headers=headers).json()["trade_count"] == 1
    assert client.post(path + "/reset-sync", headers=headers, json={"name": "错误名称", "sync_start_date": "2026-02-01"}).status_code == 400
    reset = client.post(path + "/reset-sync", headers=headers, json={"name": account["name"], "sync_start_date": "2026-02-01"})
    assert reset.status_code == 200, reset.text
    body = reset.json()
    assert body["trade_count"] == 0 and body["sync_start_date"] == "2026-02-01"
    assert body["is_statistics"] is True and body["key_prefix"] == account["key_prefix"]
    assert client.get(path + "/sync-key", headers=headers).json()["sync_key"] == key
    assert db.execute("SELECT COUNT(*) FROM deals WHERE account_login=%s", (910050,)).fetchone()[0] == 0
    assert signed_post(client, "/api/v1/ingest/deals", key, {"mt5_login": 910050, "deals": rows}).status_code == 200


def test_delete_requires_name_and_removes_associated_data(client, db):
    headers = web_headers(db, "delete-center@example.com")
    stranger = web_headers(db, "delete-stranger@example.com")
    account = create_account(client, headers, 910060).json()
    path = f"/api/v1/accounts/{account['id']}"
    key = account["sync_key"]
    assert signed_post(client, "/api/v1/ingest/deals", key, {"mt5_login": 910060, "deals": [deal(910060, position=910060, entry=0, deal_type=0, open_time=IN_WINDOW_EPOCH, deal_time=IN_WINDOW_EPOCH)]}).status_code == 200
    assert client.request("DELETE", path, headers=headers, json={"name": "错误"}).status_code == 400
    assert client.request("DELETE", path, headers=stranger, json={"name": account["name"]}).status_code == 404
    assert client.request("DELETE", path, headers=headers, json={"name": account["name"]}).status_code == 200
    assert client.get(path, headers=headers).status_code == 404
    assert db.execute("SELECT COUNT(*) FROM deals WHERE account_login=%s", (910060,)).fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM trade_lifecycles WHERE account_id=%s", (account["id"],)).fetchone()[0] == 0


def test_report_entry_returns_account_context(client, db):
    headers = web_headers(db, "report-center@example.com")
    account = create_account(client, headers, 910070).json()
    report = client.get(f"/api/v1/accounts/{account['id']}/report", headers=headers)
    assert report.status_code == 200
    assert report.json()["report"] is None and report.json()["account"]["id"] == account["id"]


def test_list_derives_snapshot_heartbeat_and_trade_count(client, db):
    headers = web_headers(db, "derive-center@example.com")
    account = create_account(client, headers, 910080).json()
    key = account["sync_key"]
    assert signed_post(client, "/api/v1/ingest/heartbeat", key, {"mt5_login": 910080, "account_currency": "USD"}).status_code == 200
    snapshot_time = int(time.time())
    assert signed_post(client, "/api/v1/ingest/snapshots", key, {
        "mt5_login": 910080,
        "snapshots": [{"balance": 100.0, "equity": 110.5, "margin": 0.0, "free_margin": 110.5, "snapshot_time": snapshot_time}],
    }).status_code == 200
    assert signed_post(client, "/api/v1/ingest/deals", key, {"mt5_login": 910080, "deals": [deal(910080, position=910080, entry=0, deal_type=0, open_time=IN_WINDOW_EPOCH, deal_time=IN_WINDOW_EPOCH)]}).status_code == 200
    body = client.get(f"/api/v1/accounts/{account['id']}", headers=headers).json()
    assert body["currency"] == "USD"
    assert body["balance"] == 100.0 and body["equity"] == 110.5
    assert body["snapshot_time"] == snapshot_time and body["ea_status"] == "online"
    assert body["trade_count"] == 1 and body["last_updated_at"] is not None


def test_never_synced_account_has_no_last_updated_at(client, db):
    headers = web_headers(db, "never-synced@example.com")
    account = create_account(client, headers, 910300).json()
    assert account["last_updated_at"] is None
    client.patch(f"/api/v1/accounts/{account['id']}", headers=headers, json={"name": "Renamed"})
    body = client.get(f"/api/v1/accounts/{account['id']}", headers=headers).json()
    assert body["last_updated_at"] is None


def test_reset_rolls_back_on_failure(client, db):
    headers = web_headers(db, "reset-rollback@example.com")
    account = create_account(client, headers, 910090).json()
    path = f"/api/v1/accounts/{account['id']}"
    key = account["sync_key"]
    assert signed_post(client, "/api/v1/ingest/deals", key, {"mt5_login": 910090, "deals": [deal(910090, position=910090, entry=0, deal_type=0, open_time=IN_WINDOW_EPOCH, deal_time=IN_WINDOW_EPOCH)]}).status_code == 200
    db.execute(
        """
        CREATE OR REPLACE FUNCTION reject_reset_center() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected reset failure'; END;
        $$
        """
    )
    db.execute("CREATE TRIGGER reject_reset_center BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION reject_reset_center()")
    try:
        with pytest.raises(Exception, match="injected reset failure"):
            client.post(path + "/reset-sync", headers=headers, json={"name": account["name"], "sync_start_date": "2026-02-01"})
    finally:
        db.execute("DROP TRIGGER reject_reset_center ON accounts")
        db.execute("DROP FUNCTION reject_reset_center()")
    assert db.execute("SELECT COUNT(*) FROM deals WHERE account_login=%s", (910090,)).fetchone()[0] == 1
    assert db.execute("SELECT sync_start_time FROM accounts WHERE id=%s", (account["id"],)).fetchone()[0] == date_to_epoch(date(2026, 1, 1))


def test_csv_import_counts_duplicates_and_errors(client, db):
    headers = web_headers(db, "csv-import@example.com")
    account = create_account(client, headers, 910100).json()
    path = f"/api/v1/accounts/{account['id']}/imports"
    csv_text = (
        "Time,Deal,Symbol,Type,Direction,Volume,Price,Order,Commission,Swap,Profit,Comment\n"
        "2026.01.15 10:00:00,910101,XAUUSD,buy,in,0.1,2000,910101,-1,0,0,open\n"
        "2026.01.15 12:00:00,910102,XAUUSD,sell,out,0.1,2010,910102,-1,0,bad,close\n"
    )
    response = client.post(path, headers=headers, files={"file": ("deals.csv", csv_text.encode(), "text/csv")})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["imported_rows"] == 1 and body["duplicate_rows"] == 0 and body["error_rows"] == 1
    assert body["errors"][0]["row_number"] == 3
    assert db.execute("SELECT COUNT(*) FROM deals WHERE account_login=%s", (910100,)).fetchone()[0] == 1
    again = client.post(path, headers=headers, files={"file": ("deals.csv", csv_text.encode(), "text/csv")})
    assert again.status_code == 200
    assert again.json()["imported_rows"] == 0 and again.json()["duplicate_rows"] == 1


def test_xlsx_import_parses_mt5_chinese_report(client, db):
    headers = web_headers(db, "xlsx-import@example.com")
    account = create_account(client, headers, 910102).json()
    path = f"/api/v1/accounts/{account['id']}/imports"

    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append(["交易历史报告"])
    sheet.append(["账户:", "346208466 (USD, demo)"])
    sheet.append(["成交"])
    sheet.append(["时间", "成交", "交易品种", "类型", "趋势", "交易量", "价位", "订单", "手续费", "费用", "库存费", "盈利", "结余", "注释"])
    sheet.append(["2026.09.17 12:12:44", 556142048, None, "balance", None, None, None, None, 0.0, 0.0, 0.0, 10000.0, 10000.0, "Deposit"])
    sheet.append(["2026.09.17 12:20:18", 556149853, "GOLD#", "sell", "in", "0.4", 4312.24, 559680460, 0.0, 0.0, 0.0, 0.0, 10000.0, "TradeEZ-SC"])
    sheet.append(["2026.09.17 12:26:47", 556155428, "GOLD#", "sell", "out", "0.4", 4309.14, 559686063, 0.0, 0.0, 0.0, -151.6, 9848.4, "[sl 4309.26]"])
    sheet.append([None, None, None, None, None, None, None, None, 0.0, 0.0, 0.0, -151.6, 9848.4, None])
    sheet.append(["持仓"])
    sheet.append(["时间", "持仓", "交易品种", "类型", "交易量", "价位", "止损", "止盈", "时间", "价位", "手续费", "库存费", "盈利"])
    sheet.append(["2026.09.17 12:20:18", 559680460, "GOLD#", "sell", "0.4", 4312.24, 4308.86, 4306.74, "2026.09.17 12:29:33", 4306.69, 0.0, 0.0, 222.0])
    buffer = io.BytesIO()
    workbook.save(buffer)

    response = client.post(
        path,
        headers=headers,
        files={"file": ("deals.xlsx", buffer.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["file_kind"] == "xlsx"
    assert body["imported_rows"] == 2 and body["error_rows"] == 0
    assert db.execute("SELECT COUNT(*) FROM deals WHERE account_login=%s", (910102,)).fetchone()[0] == 2
    row = db.execute(
        "SELECT type, entry, symbol, volume, profit, comment FROM deals WHERE account_login=%s AND ticket=%s",
        (910102, 556155428),
    ).fetchone()
    assert row["type"] == 1 and row["entry"] == 1
    assert row["symbol"] == "GOLD#" and row["volume"] == 0.4
    assert row["profit"] == -151.6 and row["comment"] == "[sl 4309.26]"
