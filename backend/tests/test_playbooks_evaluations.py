from __future__ import annotations

import pytest

from test_sync_handshake import client, db, web_headers, signed_post, deal


def _review_with_published_playbook(client, db, login: int, email: str):
    headers = web_headers(db, email)
    account = client.post("/api/v1/accounts", headers=headers, json={
        "mt5_login": login, "broker_server": "Playbook Test", "account_currency": "USD", "sync_start_time": 0,
    }).json()
    rows = [
        deal(login * 10, position=login, entry=0, deal_type=0, open_time=100, deal_time=100),
        deal(login * 10 + 1, position=login, entry=1, deal_type=1, open_time=100, deal_time=200),
    ]
    assert signed_post(client, "/api/v1/ingest/deals", account["sync_key"], {"mt5_login": login, "deals": rows}).status_code == 200
    order = client.get("/api/v1/my/orders", headers=headers, params={"account_id": account["id"]}).json()["items"][0]
    review_path = f'/api/v1/my/trades/{order["trade_id"]}/review'
    current = client.get(review_path, headers=headers).json()
    saved = client.put(review_path, headers=headers, json={
        "revision": current["revision"], "source_hash": current["source_hash"],
        "status": "draft", "notes": "用于规则评分", "tags": [],
    })
    assert saved.status_code == 200, saved.text
    review_id = saved.json()["review_id"]

    setup = client.post("/api/v1/my/setups", headers=headers, json={
        "name": f"Playbook {login}", "description": "回归测试模型",
        "symbols": ["XAUUSD", "xauusd"], "directions": ["buy"],
    })
    assert setup.status_code == 201, setup.text
    setup_json = setup.json()
    assert setup_json["symbols"] == ["XAUUSD"]
    version_id = setup_json["draft"]["id"]
    content = {key: f"{key} 内容" for key in (
        "market", "locations", "triggers", "invalidations", "risk", "management", "exit", "prohibited"
    )}
    rules = [
        {"key": "trend", "name": "顺势", "group": "environment", "checkpoint": "pre_trade",
         "answer_type": "boolean", "evaluation": "manual", "critical": True, "allow_na": False,
         "weight": 2, "options": [], "unit": "", "description": "必须顺日线方向"},
        {"key": "location", "name": "位置", "group": "location", "checkpoint": "entry",
         "answer_type": "boolean", "evaluation": "manual", "critical": False, "allow_na": True,
         "weight": 1, "options": [], "unit": "", "description": "关键位置"},
        {"key": "note", "name": "盘口记录", "group": "trigger", "checkpoint": "entry",
         "answer_type": "text", "evaluation": "manual", "critical": False, "allow_na": False,
         "weight": 1, "options": [], "unit": "", "description": "记录触发依据"},
    ]
    saved_version = client.put(f"/api/v1/my/playbook-versions/{version_id}", headers=headers, json={
        "expected_revision": 0, "content": content, "rules": rules,
    })
    assert saved_version.status_code == 200, saved_version.text
    published = client.post(
        f"/api/v1/my/playbook-versions/{version_id}/publish",
        headers=headers, params={"expected_revision": 1},
    )
    assert published.status_code == 200, published.text
    assert published.json()["status"] == "published"
    assert client.put(f"/api/v1/my/playbook-versions/{version_id}", headers=headers, json={
        "expected_revision": 1, "content": content, "rules": rules,
    }).status_code == 409
    return headers, review_id, version_id


def test_playbook_publish_immutable_and_partial_evaluation_scoring(client, db):
    headers, review_id, version_id = _review_with_published_playbook(client, db, 830001, "playbook-830001@example.com")
    path = f"/api/v1/my/reviews/{review_id}/evaluation"
    choices = client.get(path, headers=headers).json()["choices"]
    assert any(choice["id"] == version_id for choice in choices)

    partial = client.put(path, headers=headers, json={
        "expected_revision": 0, "playbook_version_id": version_id,
        "answers": [{"rule_key": "trend", "status": "pass", "evidence": "", "value": ""}],
    })
    assert partial.status_code == 200, partial.text
    result = partial.json()
    assert result["complete"] is False
    assert result["score"] is None
    assert result["coverage"] == pytest.approx(2 / 3)
    assert result["compliance"] == "insufficient"
    assert result["revision"] == 1

    complete = client.put(path, headers=headers, json={
        "expected_revision": 1, "playbook_version_id": version_id,
        "answers": [
            {"rule_key": "trend", "status": "fail", "evidence": "逆势入场", "value": ""},
            {"rule_key": "location", "status": "na", "evidence": "该时段无关键位", "value": ""},
            {"rule_key": "note", "status": "pass", "evidence": "", "value": "价格突破后回踩确认"},
        ],
    })
    assert complete.status_code == 200, complete.text
    full = complete.json()
    assert full["complete"] is True
    assert full["coverage"] == 1
    assert full["score"] == 0
    assert full["compliance"] == "violations"
    assert full["critical_failures"] == ["trend"]
    assert client.put(path, headers=headers, json={
        "expected_revision": 1, "playbook_version_id": version_id, "answers": [],
    }).status_code == 409


def test_review_evaluation_requires_owner_published_version_and_evidence(client, db):
    headers, review_id, version_id = _review_with_published_playbook(client, db, 830002, "playbook-830002@example.com")
    other = web_headers(db, "playbook-stranger@example.com")
    path = f"/api/v1/my/reviews/{review_id}/evaluation"
    body = {"expected_revision": 0, "playbook_version_id": version_id, "answers": []}
    assert client.get(path, headers=other).status_code == 404
    assert client.put(path, headers=other, json=body).status_code == 404
    assert client.put(path, headers=headers, json={**body, "answers": [
        {"rule_key": "trend", "status": "unknown", "evidence": "", "value": ""}
    ]}).status_code == 400
    assert client.put(path, headers=headers, json={**body, "answers": [
        {"rule_key": "trend", "status": "na", "evidence": "", "value": ""}
    ]}).status_code == 400
    assert client.put(path, headers=headers, json={**body, "answers": [
        {"rule_key": "missing", "status": "pass", "evidence": "", "value": ""}
    ]}).status_code == 400
