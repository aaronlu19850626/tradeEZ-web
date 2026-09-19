import pytest
from pydantic import ValidationError

from app.trades.reflection import Reflection
from test_sync_handshake import client, db, web_headers, signed_post, deal


def setup_review(client, db, login):
    headers = web_headers(db, f"reflection-{login}@example.com")
    account = client.post("/api/v1/accounts", headers=headers, json={
        "mt5_login": login, "broker_server": "Test", "sync_start_time": 0}).json()
    rows = [deal(login*10, position=login, entry=0, deal_type=0, open_time=100, deal_time=100),
            deal(login*10+1, position=login, entry=1, deal_type=1, open_time=100, deal_time=200)]
    assert signed_post(client, "/api/v1/ingest/deals", account["sync_key"], {"mt5_login": login, "deals": rows}).status_code == 200
    trade = client.get("/api/v1/my/orders", headers=headers, params={"account_id": account["id"]}).json()["items"][0]
    path = f'/api/v1/my/trades/{trade["trade_id"]}/review'
    current = client.get(path, headers=headers).json()
    body = {"revision": current["revision"], "source_hash": current["source_hash"], "notes": "原笔记", "tags": ["复盘分类"], "status": "reviewed"}
    return headers, account, path, body, rows


def test_reflection_legacy_compatibility_filters_and_conflict(client, db):
    headers, account, path, body, rows = setup_review(client, db, 820001)
    assert client.put(path, headers=headers, json=body).status_code == 200
    old = client.get(path, headers=headers).json()
    assert old["reflection"] == Reflection().model_dump() and old["status"] == "reviewed"
    reflection = dict(emotion_before="anxious", emotion_after="calm", emotion_notes="回忆当时的紧张",
        error_assessment="identified", errors=["chasing", "oversized", "chasing"], primary_error="chasing",
        conclusion="  保留入场确认\n避免追单  ", next_action="下次缩小仓位", no_new_action=False)
    body.update(revision=1, reflection=reflection)
    saved = client.put(path, headers=headers, json=body)
    assert saved.status_code == 200, saved.text
    current = client.get(path, headers=headers).json()
    expected = Reflection(**reflection).model_dump()
    assert current["reflection"] == expected and expected["errors"] == ["chasing", "oversized"]
    stale = client.put(path, headers=headers, json={**body, "reflection": {**reflection, "conclusion": "旧窗口覆盖"}})
    assert stale.status_code == 409 and client.get(path, headers=headers).json()["reflection"] == expected
    # Older clients and tag maintenance must not erase the new columns.
    legacy = {key: value for key, value in body.items() if key != "reflection"}
    legacy.update(revision=2, notes="旧客户端编辑笔记")
    assert client.put(path, headers=headers, json=legacy).status_code == 200
    assert client.get(path, headers=headers).json()["reflection"] == expected
    tag_body = {"source": "复盘分类", "target": "分类已更新", "account_id": account["id"]}
    preview = client.post("/api/v1/my/review-tags/change-preview", headers=headers, json=tag_body).json()
    assert client.post("/api/v1/my/review-tags/change", headers=headers, json={**tag_body, "revision": preview["revision"]}).status_code == 200
    assert client.get(path, headers=headers).json()["reflection"] == expected
    scope = {"account_id": account["id"], "primary_error": "chasing", "tag": "分类已更新"}
    for query in ("入场确认", "缩小仓位", "紧张"):
        response = client.get("/api/v1/my/reviews", headers=headers, params={**scope, "q": query, "emotion": "anxious"}).json()
        assert response["total"] == 1 and response["items"][0]["reflection"] == expected
    assert client.get("/api/v1/my/reviews", headers=headers, params={**scope, "emotion": "calm"}).json()["total"] == 1
    for query in ({"emotion": "greedy"}, {"primary_error": "oversized"}, {"q": "%"}):
        assert client.get("/api/v1/my/reviews", headers=headers, params={**scope, **query}).json()["total"] == 0
    assert client.get("/api/v1/my/reviews", headers=headers, params={**scope, "page": 2, "page_size": 1}).json()["items"] == []
    other = web_headers(db, "reflection-stranger@example.com")
    assert client.get(path, headers=other).status_code == 404
    assert client.put(path, headers=other, json=body).status_code == 404
    assert client.get("/api/v1/my/reviews", headers=other, params=scope).json()["total"] == 0
    assert client.get("/api/v1/my/reviews", headers=headers, params={"emotion": "invalid"}).status_code == 400


def test_reflection_completion_corrections_and_reset(client, db):
    headers, account, path, body, rows = setup_review(client, db, 820002)
    body["reflection"] = {}
    assert client.put(path, headers=headers, json=body).status_code == 400
    assert client.get(path, headers=headers).json()["revision"] == 0
    body["status"] = "draft"
    assert client.put(path, headers=headers, json=body).status_code == 200
    body.update(revision=1, status="reviewed", reflection={"conclusion": "保持纪律", "no_new_action": True, "error_assessment": "none"})
    assert client.put(path, headers=headers, json=body).status_code == 200
    expected = client.get(path, headers=headers).json()["reflection"]
    rows[1]["profit"] = -12
    assert signed_post(client, "/api/v1/ingest/deals", account["sync_key"], {"mt5_login": 820002, "deals": [rows[1]]}).status_code == 200
    changed = client.get(path, headers=headers).json()
    assert changed["source_changed"] is True and changed["reflection"] == expected
    assert client.put(path, headers=headers, json={**body, "revision": 2}).status_code == 409
    account_path = f'/api/v1/accounts/{account["id"]}'
    preview = client.get(account_path + "/maintenance-preview", headers=headers).json()
    reset = client.post(account_path + "/reset-sync", headers=headers, json={"confirm_login": "820002", "revision": preview["revision"], "sync_start_time": 0})
    assert reset.status_code == 200
    result = client.get("/api/v1/my/reviews", headers=headers, params={"account_id": account["id"], "association": "orphan", "q": "保持纪律"}).json()
    assert result["total"] == 1 and result["items"][0]["reflection"] == expected
    assert signed_post(client, "/api/v1/ingest/deals", reset.json()["sync_key"], {"mt5_login": 820002, "deals": rows}).status_code == 200
    recovered = client.get("/api/v1/my/reviews", headers=headers, params={"account_id": account["id"], "association": "linked"}).json()
    assert recovered["total"] == 1 and recovered["items"][0]["reflection"] == expected


def test_review_versions_are_ordered_complete_and_owner_scoped(client, db):
    headers, account, path, body, _ = setup_review(client, db, 820003)
    body.update(status="draft", reflection={"conclusion": "第一版"})
    assert client.put(path, headers=headers, json=body).status_code == 200
    body.update(revision=1, notes="第二版笔记", status="reviewed",
                reflection={"conclusion": "第二版", "next_action": "等待确认"})
    assert client.put(path, headers=headers, json=body).status_code == 200
    versions = client.get(path + "/versions", headers=headers, params={"page_size": 1}).json()
    assert versions["total"] == 2 and versions["items"][0]["revision"] == 2
    assert versions["items"][0]["notes"] == "第二版笔记"
    assert versions["items"][0]["reflection"]["conclusion"] == "第二版"
    older = client.get(path + "/versions", headers=headers, params={"page": 2, "page_size": 1}).json()
    assert older["items"][0]["revision"] == 1 and older["items"][0]["status"] == "draft"
    other = web_headers(db, "versions-stranger@example.com")
    assert client.get(path + "/versions", headers=other).status_code == 404


@pytest.mark.parametrize("invalid", [
    {"emotion_before": "unknown"}, {"emotion_after": "unknown"}, {"conclusion": "x"*2001},
    {"error_assessment": "identified"}, {"error_assessment": "none", "errors": ["chasing"]},
    {"error_assessment": "identified", "errors": ["chasing"], "primary_error": "oversized"},
    {"no_new_action": True, "next_action": "仍有行动"}, {"no_new_action": "false"},
    {"recording_basis": "contemporaneous"}, {"unexpected": "value"},
])
def test_invalid_reflection_combinations(invalid):
    with pytest.raises(ValidationError):
        Reflection(**invalid)
