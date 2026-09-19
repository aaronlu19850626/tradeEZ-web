from __future__ import annotations

from test_sync_handshake import client, db, web_headers, make_account, signed_post, settings, create_access_token  # noqa: F401


def owner_headers(db_connection):
    user = db_connection.execute("SELECT * FROM users WHERE email='tester@example.com'").fetchone()
    return {"Authorization": "Bearer " + create_access_token(user, settings)}


def _account_id(db_connection, login):
    return db_connection.execute("SELECT id FROM accounts WHERE mt5_login=?", (login,)).fetchone()[0]


def test_snapshot_series_auth_ownership_and_ordering(client, db):
    login = 470001
    key = make_account(db, login)
    account_id = _account_id(db, login)
    path = f"/api/v1/my/accounts/{account_id}/snapshots"
    assert client.get(path).status_code == 401
    stranger = web_headers(db, "snapshot-series-stranger@example.com")
    assert client.get(path, headers=stranger).status_code == 404

    points = [
        {"balance": 1000.0, "equity": 1001.0, "margin": 0.0, "free_margin": 1001.0, "snapshot_time": 100},
        {"balance": 1000.0, "equity": 1005.0, "margin": 20.0, "free_margin": 985.0, "snapshot_time": 200},
        {"balance": 1000.0, "equity": 998.0, "margin": 10.0, "free_margin": 988.0, "snapshot_time": 300},
    ]
    for point in points:
        assert signed_post(client, "/api/v1/ingest/snapshots", key, {"mt5_login": login, "snapshots": [point]}).status_code == 200

    owner = owner_headers(db)
    response = client.get(path, headers=owner)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 3 and body["currency"] == "USD"
    assert [item["timestamp"] for item in body["items"]] == [100, 200, 300]
    assert body["items"][1]["margin"] == 20.0 and body["items"][1]["margin_level"] is None

    bounded = client.get(path, headers=owner, params={"start_time": 150, "end_time": 250}).json()
    assert bounded["total"] == 1 and [i["timestamp"] for i in bounded["items"]] == [200]

    newest = client.get(path, headers=owner, params={"limit": 2}).json()
    assert newest["total"] == 3 and [i["timestamp"] for i in newest["items"]] == [200, 300]

    assert client.get(path, headers=owner, params={"start_time": 300, "end_time": 100}).status_code == 400
    for bad_limit in (0, 2001):
        assert client.get(path, headers=owner, params={"limit": bad_limit}).status_code == 400


def test_symbol_specs_auth_pagination_and_search(client, db):
    login = 470002
    key = make_account(db, login)
    account_id = _account_id(db, login)
    path = f"/api/v1/my/accounts/{account_id}/symbols"
    assert client.get(path).status_code == 401
    stranger = web_headers(db, "symbol-specs-stranger@example.com")
    assert client.get(path, headers=stranger).status_code == 404

    payload = {"mt5_login": login, "symbols": [
        {"name": "EURUSD", "digits": 5, "point": 0.00001, "tick_value": 1.0, "contract_size": 100000.0},
        {"name": "XAUUSD", "digits": 2, "point": 0.01, "tick_value": 1.0, "contract_size": 100.0},
    ]}
    assert signed_post(client, "/api/v1/ingest/symbols", key, payload).status_code == 200

    owner = owner_headers(db)
    response = client.get(path, headers=owner)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 2 and [item["symbol"] for item in body["items"]] == ["EURUSD", "XAUUSD"]
    gold = next(item for item in body["items"] if item["symbol"] == "XAUUSD")
    assert gold["digits"] == 2 and gold["point"] == 0.01 and gold["contract_size"] == 100.0

    searched = client.get(path, headers=owner, params={"q": "xau"}).json()
    assert searched["total"] == 1 and searched["items"][0]["symbol"] == "XAUUSD"
    first_page = client.get(path, headers=owner, params={"page_size": 1}).json()
    assert first_page["total"] == 2 and [i["symbol"] for i in first_page["items"]] == ["EURUSD"]
    second_page = client.get(path, headers=owner, params={"page_size": 1, "page": 2}).json()
    assert [i["symbol"] for i in second_page["items"]] == ["XAUUSD"]
    assert client.get(path, headers=owner, params={"page_size": 1, "page": 3}).json()["items"] == []
    for invalid in ({"page": 0}, {"page_size": 0}, {"page_size": 501}, {"q": "x" * 51}):
        assert client.get(path, headers=owner, params=invalid).status_code == 400

