from __future__ import annotations

from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from test_sync_handshake import client, db, deal, signed_post, web_headers


def _publish_playbook(client, headers, login: int) -> int:
    setup = client.post("/api/v1/my/setups", headers=headers, json={
        "name": f"Planning Playbook {login}",
        "description": "Allowed playbook for daily plan",
        "symbols": ["XAUUSD"],
        "directions": ["buy"],
    })
    assert setup.status_code == 201, setup.text
    version_id = setup.json()["draft"]["id"]
    saved = client.put(f"/api/v1/my/playbook-versions/{version_id}", headers=headers, json={
        "expected_revision": 0,
        "content": {key: f"{key} 内容" for key in (
            "market", "locations", "triggers", "invalidations", "risk", "management", "exit", "prohibited"
        )},
        "rules": [{
            "key": "stop", "name": "必须设置止损", "description": "交易前明确失效点",
            "group": "risk", "checkpoint": "pre_trade", "answer_type": "boolean",
            "evaluation": "manual", "critical": True, "allow_na": False,
            "weight": 1, "options": [], "unit": "",
        }],
    })
    assert saved.status_code == 200, saved.text
    published = client.post(
        f"/api/v1/my/playbook-versions/{version_id}/publish",
        headers=headers, params={"expected_revision": 1},
    )
    assert published.status_code == 200, published.text
    return version_id


def test_daily_plan_intention_daily_and_weekly_review_follow_late_corrections(client, db):
    login = 840001
    headers = web_headers(db, "planning-840001@example.com")
    account = client.post("/api/v1/accounts", headers=headers, json={
        "mt5_login": login, "broker_server": "Planning Test", "account_currency": "USD", "sync_start_time": 0,
    })
    assert account.status_code == 201, account.text
    account_json = account.json()
    account_id = account_json["id"]
    version_id = _publish_playbook(client, headers, login)

    local_day = date(2026, 9, 15)
    zone = ZoneInfo("Asia/Shanghai")
    open_ts = int(datetime.combine(local_day, time(10, 0), zone).timestamp())
    close_ts = int(datetime.combine(local_day, time(15, 0), zone).timestamp())
    rows = [
        deal(8400010, position=840001, entry=0, deal_type=0, open_time=open_ts, deal_time=open_ts),
        deal(8400011, position=840001, entry=1, deal_type=1, open_time=open_ts, deal_time=close_ts),
    ]
    uploaded = signed_post(client, "/api/v1/ingest/deals", account_json["sync_key"], {"mt5_login": login, "deals": rows})
    assert uploaded.status_code == 200, uploaded.text

    plan_payload = {
        "expected_revision": 0,
        "account_id": account_id,
        "plan_date": local_day.isoformat(),
        "timezone": "Asia/Shanghai",
        "mode": "trade",
        "self_state": "Calm",
        "market_view": "Wait for breakout retest",
        "events": "",
        "risk_limit": "Max daily loss 100 USD",
        "stop_conditions": "Stop after 100 USD loss",
        "improvement_focus": "Wait for confirmation",
        "waiting_condition": "",
        "no_trade_reason": "",
        "allowed_playbook_version_ids": [version_id],
        "scenarios": [{
            "id": "gold-retest", "name": "Gold retest", "symbol": "XAUUSD", "direction": "buy",
            "playbook_version_id": version_id, "area": "Near prior high", "confirmation": "Turn strong after holding retest",
            "invalidation": "Fall back into breakout range", "exit_principle": "Exit below structure", "session": "",
        }],
        "change_reason": "",
    }
    saved_plan = client.put("/api/v1/my/day-plan", headers=headers, json=plan_payload)
    assert saved_plan.status_code == 200, saved_plan.text
    plan_json = saved_plan.json()
    plan_id = plan_json["id"]
    assert plan_json["revision"] == 1 and plan_json["status"] == "draft"

    confirmed = client.post(f"/api/v1/my/day-plans/{plan_id}/confirm", headers=headers, params={"expected_revision": 1})
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "confirmed"
    # This is a historical plan and the synchronized trade opened before the confirmation time.
    assert confirmed.json()["confirmed_late"] is True

    intentions = client.get("/api/v1/my/intentions", headers=headers, params={
        "account_id": account_id, "plan_date": local_day.isoformat(),
    })
    assert intentions.status_code == 200, intentions.text
    assert intentions.json()["plan_id"] == plan_id
    assert [item["id"] for item in intentions.json()["scenarios"]] == ["gold-retest"]

    created_intention = client.post("/api/v1/my/intentions", headers=headers, json={
        "account_id": account_id,
        "day_plan_id": plan_id,
        "scenario_id": "gold-retest",
        "playbook_version_id": version_id,
        "symbol": "xauusd",
        "direction": "buy",
        "state": "prepared",
        "entry_basis": "Breakout retest confirmed",
        "risk_plan": "Fixed monetary risk",
    })
    assert created_intention.status_code == 201, created_intention.text
    intention_json = created_intention.json()
    intention_id = intention_json["id"]
    assert intention_json["symbol"] == "XAUUSD"

    executed = client.post(f"/api/v1/my/intentions/{intention_id}/transition", headers=headers, json={
        "state": "executed_unlinked", "reason": "EA deal synchronized; ready to link manually",
    })
    assert executed.status_code == 200, executed.text
    candidates = client.get(f"/api/v1/my/intentions/{intention_id}/candidates", headers=headers)
    assert candidates.status_code == 200, candidates.text
    candidate_items = candidates.json()
    assert len(candidate_items) == 1 and candidate_items[0]["symbol"] == "XAUUSD"
    linked = client.post(f"/api/v1/my/intentions/{intention_id}/link", headers=headers, json={
        "trade_id": candidate_items[0]["trade_id"],
    })
    assert linked.status_code == 200, linked.text
    assert linked.json()["state"] == "linked" and linked.json()["linked_trade_id"] == candidate_items[0]["trade_id"]

    review_path = f"/api/v1/my/trades/{candidate_items[0]['trade_id']}/review"
    current_review = client.get(review_path, headers=headers).json()
    saved_review = client.put(review_path, headers=headers, json={
        "revision": current_review["revision"],
        "source_hash": current_review["source_hash"],
        "status": "reviewed",
        "notes": "Followed the plan",
        "tags": ["plan"],
        "reflection": {
            "error_assessment": "none",
            "conclusion": "Followed the planned confirmation",
            "next_action": "",
            "no_new_action": True,
        },
    })
    assert saved_review.status_code == 200, saved_review.text

    daily_params = {"account_id": account_id, "review_date": local_day.isoformat(), "timezone": "Asia/Shanghai"}
    current_daily = client.get("/api/v1/my/daily-review", headers=headers, params=daily_params)
    assert current_daily.status_code == 200, current_daily.text
    summary = current_daily.json()["current_summary"]
    assert summary["deal_count"] == 2
    assert summary["closed_trades"] == 1
    assert summary["intentions"] == 1 and summary["linked_intentions"] == 1
    assert summary["net_pnl"] == 8.5

    daily_payload = {
        "expected_revision": 0,
        "account_id": account_id,
        "review_date": local_day.isoformat(),
        "timezone": "Asia/Shanghai",
        "plan_difference": "Market matched the plan",
        "execution_review": "Followed the planned confirmation",
        "keep_behavior": "Keep waiting for confirmation",
        "main_problem": "No material problem",
        "next_action": "",
        "no_new_action": True,
        "data_reviewed": True,
    }
    completed_daily = client.put("/api/v1/my/daily-review?complete=true", headers=headers, json=daily_payload)
    assert completed_daily.status_code == 200, completed_daily.text
    assert completed_daily.json()["status"] == "completed"
    assert completed_daily.json()["revision"] == 1

    # A late source correction must retain the answers but force the completed daily review to be rechecked.
    corrected_exit = {**rows[1], "profit": 12.0}
    recorrected = signed_post(client, "/api/v1/ingest/deals", account_json["sync_key"], {"mt5_login": login, "deals": [corrected_exit]})
    assert recorrected.status_code == 200, recorrected.text
    changed_daily = client.get("/api/v1/my/daily-review", headers=headers, params=daily_params).json()
    assert changed_daily["source_changed"] is True
    assert changed_daily["status"] == "needs_review"
    assert changed_daily["saved_summary"]["net_pnl"] == 8.5
    assert changed_daily["current_summary"]["net_pnl"] == 10.5

    daily_payload["expected_revision"] = 1
    recompleted_daily = client.put("/api/v1/my/daily-review?complete=true", headers=headers, json=daily_payload)
    assert recompleted_daily.status_code == 200, recompleted_daily.text
    assert recompleted_daily.json()["status"] == "completed"
    assert recompleted_daily.json()["source_changed"] is False

    week_start = date(2026, 9, 14)
    weekly = client.get("/api/v1/my/weekly-review", headers=headers, params={"week_start": week_start.isoformat()})
    assert weekly.status_code == 200, weekly.text
    weekly_summary = weekly.json()["current_summary"]
    assert weekly_summary["days_recorded"] == 1
    assert weekly_summary["days_completed"] == 1
    assert weekly_summary["closed_trades"] == 1 and weekly_summary["reviewed"] == 1
    assert weekly_summary["net_pnl"] == 10.5
    completed_weekly = client.put("/api/v1/my/weekly-review?complete=true", headers=headers, json={
        "expected_revision": 0,
        "week_start": week_start.isoformat(),
        "achievements": "Maintained patient confirmation",
        "recurring_problems": "No repeated problem",
        "next_focus": "Continue applying the stop rule",
    })
    assert completed_weekly.status_code == 200, completed_weekly.text
    weekly_json = completed_weekly.json()
    assert weekly_json["status"] == "completed" and weekly_json["revision"] == 1

    action = client.post("/api/v1/my/improvement-actions", headers=headers, json={
        "weekly_review_id": weekly_json["id"],
        "title": "Confirm before entry next week",
        "success_measure": "Every trade has explicit confirmation",
        "target_date": "2026-09-21",
    })
    assert action.status_code == 201, action.text
    action_json = action.json()
    updated_action = client.patch(f"/api/v1/my/improvement-actions/{action_json['id']}", headers=headers, json={
        "expected_revision": 1, "status": "completed", "outcome": "Check became a consistent habit",
    })
    assert updated_action.status_code == 200, updated_action.text

    habits = client.get("/api/v1/my/habit-summary", headers=headers, params={
        "start_date": week_start.isoformat(), "end_date": "2026-09-20",
    })
    assert habits.status_code == 200, habits.text
    habits_json = habits.json()
    assert habits_json["plans"]["recorded"] == 1 and habits_json["plans"]["confirmed"] == 1
    assert habits_json["plans"]["rate"] == round(100.0 / 7, 1)
    assert habits_json["daily_reviews"]["recorded"] == 1 and habits_json["daily_reviews"]["completed"] == 1
    assert habits_json["daily_reviews"]["rate"] == round(100.0 / 7, 1)
    assert habits_json["trade_reviews"]["total"] == 1 and habits_json["trade_reviews"]["completed"] == 1

    other = web_headers(db, "planning-stranger@example.com")
    assert client.get("/api/v1/my/day-plan", headers=other, params={
        "account_id": account_id, "plan_date": local_day.isoformat(),
    }).status_code == 404
    assert client.get("/api/v1/my/daily-review", headers=other, params=daily_params).status_code == 404
    assert client.get(f"/api/v1/my/intentions/{intention_id}/candidates", headers=other).status_code == 404
    assert client.patch(f"/api/v1/my/improvement-actions/{action_json['id']}", headers=other, json={
        "expected_revision": 2, "status": "active", "outcome": "Check became a consistent habit",
    }).status_code == 404
