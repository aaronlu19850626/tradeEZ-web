from concurrent.futures import ThreadPoolExecutor

from test_sync_handshake import client, db, web_headers


def test_notes_owner_validation_conflict_and_clear(client, db):
    owner = web_headers(db, "notes-owner@example.com")
    stranger = web_headers(db, "notes-stranger@example.com")
    created = client.post("/api/v1/accounts", headers=owner, json={
        "mt5_login": 770001, "broker_server": "Test", "sync_start_time": 0,
        "notes": "  实验账户\n只做回测  "})
    assert created.status_code == 201, created.text
    account = created.json()
    path = f'/api/v1/accounts/{account["id"]}'
    assert account["notes"] == "实验账户\n只做回测" and account["config_revision"] == 0
    assert client.get(path, headers=stranger).status_code == 404
    assert client.patch(path, headers=stranger, json={"notes": "覆盖", "expected_revision": 0}).status_code == 404
    assert client.patch(path, headers=owner, json={"notes": "无版本"}).status_code == 400
    for payload in ({"notes": "x"*2001, "expected_revision": 0}, {"notes": 1, "expected_revision": 0},
                    {"notes": "text", "expected_revision": True}):
        assert client.patch(path, headers=owner, json=payload).status_code == 400
    changed = client.patch(path, headers=owner, json={"notes": "新的备注", "expected_revision": 0})
    assert changed.status_code == 200 and changed.json()["config_revision"] == 1
    unchanged = client.patch(path, headers=owner, json={"notes": "新的备注", "expected_revision": 1})
    assert unchanged.json()["config_revision"] == 1
    stale = client.patch(path, headers=owner, json={"notes": "旧页面", "label": "不应保存", "expected_revision": 0})
    assert stale.status_code == 409
    current = client.get(path, headers=owner).json()
    assert current["notes"] == "新的备注" and current["label"] is None
    cleared = client.patch(path, headers=owner, json={"notes": " \n ", "expected_revision": 1})
    assert cleared.status_code == 200 and cleared.json()["notes"] is None
    assert cleared.json()["config_revision"] == 2


def test_notes_concurrent_writes_and_maintenance(client, db):
    owner = web_headers(db, "notes-maintenance@example.com")
    account = client.post("/api/v1/accounts", headers=owner, json={
        "mt5_login": 770002, "broker_server": "Test", "sync_start_time": 0}).json()
    path = f'/api/v1/accounts/{account["id"]}'
    def save(notes):
        return client.patch(path, headers=owner, json={"notes": notes, "expected_revision": 0})
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(save, ["草稿一", "草稿二"]))
    assert sorted(r.status_code for r in responses) == [200, 409]
    saved = next(r.json() for r in responses if r.status_code == 200)
    preview_path = path + "/maintenance-preview"
    preview = client.get(preview_path, headers=owner)
    assert preview.status_code == 200, preview.text
    updated = client.patch(path, headers=owner, json={"notes": "重同步应保留", "expected_revision": 1})
    assert updated.status_code == 200
    body = {"confirm_login": "770002", "revision": preview.json()["revision"], "sync_start_time": 0}
    assert client.post(path + "/reset-sync", headers=owner, json=body).status_code == 409
    body["revision"] = client.get(preview_path, headers=owner).json()["revision"]
    reset = client.post(path + "/reset-sync", headers=owner, json=body)
    assert reset.status_code == 200, reset.text
    assert reset.json()["notes"] == "重同步应保留" and reset.json()["config_revision"] == 3
    assert client.patch(path, headers=owner, json={"notes": saved["notes"], "expected_revision": 2}).status_code == 409
    body = {"confirm_login": "770002", "revision": client.get(preview_path, headers=owner).json()["revision"]}
    assert client.request("DELETE", path, headers=owner, json=body).status_code == 200
    assert client.get(path, headers=owner).status_code == 404
