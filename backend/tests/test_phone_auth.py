import json
import pytest

from test_sync_handshake import client, db


def test_phone_test_mode_registration_and_existing_login(client, db, monkeypatch):
    from app.web_auth import service
    monkeypatch.setattr(service.settings, "auth_test_mode", True)
    monkeypatch.setattr(service, "send_verification_sms", lambda *args: pytest.fail("Test mode must not send SMS"))
    monkeypatch.setattr(service, "send_verification_email", lambda *args: pytest.fail("Test mode must not send email"))
    phone = "13800001231"
    body = {"phone": phone, "code": "123456"}
    assert client.get("/api/v1/auth/config").json()["test_mode"] is True
    assert client.post("/api/v1/auth/verify-code", json=body).status_code == 400
    sent = client.post("/api/v1/auth/send-code", json={"phone": phone})
    assert sent.status_code == 200 and "123456" in sent.json()["message"]
    assert client.post("/api/v1/auth/send-code", json={"phone": "+86" + phone}).status_code == 429
    registered = client.post("/api/v1/auth/verify-code", json={**body, "phone": "+86" + phone})
    assert registered.status_code == 200, registered.text
    data = registered.json()
    assert data["is_new_user"] is True
    assert data["user"]["phone"] == "+86" + phone and data["user"]["email"] is None
    headers = {"Authorization": "Bearer " + data["access_token"]}
    assert client.get("/api/v1/users/me", headers=headers).json() == data["user"]
    assert client.get("/api/v1/accounts", headers=headers).json() == []
    assert client.post("/api/v1/auth/verify-code", json=body).status_code == 400
    db.execute("UPDATE auth_codes SET created_at=created_at-120 WHERE email=?", ("phone:+86"+phone,))
    db.commit()
    assert client.post("/api/v1/auth/send-code", json={"phone": phone}).status_code == 200
    again = client.post("/api/v1/auth/verify-code", json=body).json()
    assert again["is_new_user"] is False and again["user"]["id"] == data["user"]["id"]
    email = "phone-mode-email@example.com"
    assert client.post("/api/v1/auth/send-code", json={"email": email}).status_code == 200
    email_user = client.post("/api/v1/auth/verify-code", json={"email": email, "code": "123456"}).json()["user"]
    assert email_user["id"] != data["user"]["id"] and email_user["phone"] is None


def test_phone_random_delivery_and_pending_failure(client, db, monkeypatch):
    from app.web_auth import service
    monkeypatch.setattr(service.settings, "auth_test_mode", False)
    monkeypatch.setattr(service.settings, "dev_fixed_login_code", "")
    monkeypatch.setattr(service.secrets, "randbelow", lambda _: 42)
    phone = "13800001232"
    def deliver(config, destination, code):
        assert destination == "+86"+phone and code == "000042"
        assert client.post("/api/v1/auth/verify-code", json={"phone": phone, "code": code}).status_code == 400
    monkeypatch.setattr(service, "send_verification_sms", deliver)
    sent = client.post("/api/v1/auth/send-code", json={"phone": phone})
    assert sent.status_code == 200 and "000042" not in sent.text and "123456" not in sent.text
    assert client.post("/api/v1/auth/verify-code", json={"phone": phone, "code": "123456"}).status_code == 400
    assert client.post("/api/v1/auth/verify-code", json={"phone": phone, "code": "000042"}).status_code == 200
    def fail(*args):
        raise RuntimeError("provider secret should not leak")
    monkeypatch.setattr(service, "send_verification_sms", fail)
    monkeypatch.setattr(service, "send_verification_email", fail)
    for identity in ({"phone": "13800001233"}, {"email": "failed-send@example.com"}):
        failed = client.post("/api/v1/auth/send-code", json=identity)
        assert failed.status_code == 502 and "secret" not in failed.text
        assert client.post("/api/v1/auth/verify-code", json={**identity, "code": "000042"}).status_code == 400
    assert db.execute("SELECT consumed,delivery_status FROM auth_codes WHERE email='phone:+8613800001233'").fetchone()[:] == (1, "failed")


def test_phone_test_challenge_cannot_cross_mode_or_identity(client, db, monkeypatch):
    from app.web_auth import service
    monkeypatch.setattr(service.settings, "auth_test_mode", True)
    phone = "13800001234"
    assert client.post("/api/v1/auth/send-code", json={"phone": phone}).status_code == 200
    assert client.post("/api/v1/auth/verify-code", json={"phone": "13800001235", "code": "123456"}).status_code == 400
    monkeypatch.setattr(service.settings, "auth_test_mode", False)
    assert client.post("/api/v1/auth/verify-code", json={"phone": phone, "code": "123456"}).status_code == 400
    monkeypatch.setattr(service.settings, "auth_test_mode", True)
    for _ in range(5):
        assert client.post("/api/v1/auth/verify-code", json={"phone": phone, "code": "000000"}).status_code == 400
    assert client.post("/api/v1/auth/verify-code", json={"phone": phone, "code": "123456"}).status_code == 400
    for invalid in ({}, {"phone": "123"}, {"phone": "+14155552671"}, {"phone": "13800001234,13800001235"},
                    {"phone": phone, "email": "x@example.com"}, {"email": "phone:+8613800001234"}):
        assert client.post("/api/v1/auth/send-code", json=invalid).status_code == 400


def test_production_auth_configuration_guard():
    from app.config import Settings
    from pydantic import ValidationError
    config = dict(_env_file=None, environment="production", dev_fixed_login_code="", auth_test_mode=False,
        email_provider="smtp", sms_provider="aliyun", smtp_host="smtp.example.com", smtp_from_email="auth@example.com",
        aliyun_access_key_id="test-id", aliyun_access_key_secret="test-secret", aliyun_sms_sign_name="测试签名",
        aliyun_sms_template_code="SMS_TEST")
    assert Settings(**config).test_codes_enabled is False
    for invalid in ({"auth_test_mode": True}, {"dev_fixed_login_code": "123456"}, {"sms_provider": "disabled"},
                    {"email_provider": "console"}, {"aliyun_sms_template_code": ""}, {"smtp_starttls": False, "smtp_ssl": False}):
        with pytest.raises(ValidationError):
            Settings(**{**config, **invalid})


def test_aliyun_sms_sdk_adapter(monkeypatch):
    from types import SimpleNamespace
    from app.config import Settings
    from app.sms import send_verification_sms
    from alibabacloud_dysmsapi20170525.client import Client
    calls = []
    def fake_send(self, request, runtime):
        calls.append((request, runtime))
        return SimpleNamespace(body=SimpleNamespace(code="OK"))
    monkeypatch.setattr(Client, "send_sms_with_options", fake_send)
    config = Settings(_env_file=None, dev_fixed_login_code="", sms_provider="aliyun",
        aliyun_access_key_id="test-id", aliyun_access_key_secret="test-secret",
        aliyun_sms_sign_name="测试签名", aliyun_sms_template_code="SMS_TEST")
    send_verification_sms(config, "+8613800001236", "000042")
    request, runtime = calls[0]
    assert request.phone_numbers == "13800001236" and request.sign_name == "测试签名"
    assert request.template_code == "SMS_TEST" and json.loads(request.template_param) == {"code": "000042"}
    assert runtime.autoretry is False and runtime.read_timeout == 10000
    monkeypatch.setattr(Client, "send_sms_with_options", lambda *args: SimpleNamespace(body=SimpleNamespace(code="isv.BUSINESS_LIMIT_CONTROL")))
    with pytest.raises(RuntimeError, match="rejected"):
        send_verification_sms(config, "+8613800001236", "000042")


def test_auth_send_ip_and_global_limits(client, db, monkeypatch):
    from app.web_auth import service
    monkeypatch.setattr(service.settings, "auth_test_mode", True)
    monkeypatch.setattr(service.settings, "code_max_per_ip_hour", 1)
    assert client.post("/api/v1/auth/send-code", json={"phone": "13800001237"}).status_code == 429
    monkeypatch.setattr(service.settings, "code_max_per_ip_hour", 1000)
    monkeypatch.setattr(service.settings, "code_max_total_per_day", 1)
    assert client.post("/api/v1/auth/send-code", json={"phone": "13800001238"}).status_code == 429


def test_phone_expiration_and_concurrent_single_use(client, db, monkeypatch):
    from app.web_auth import service
    from concurrent.futures import ThreadPoolExecutor
    monkeypatch.setattr(service.settings, "auth_test_mode", True)
    phone = "13800001239"
    assert client.post("/api/v1/auth/send-code", json={"phone": phone}).status_code == 200
    db.execute("UPDATE auth_codes SET expires_at=0,created_at=created_at-120 WHERE email=?", ("phone:+86"+phone,))
    db.commit()
    body = {"phone": phone, "code": "123456"}
    assert client.post("/api/v1/auth/verify-code", json=body).status_code == 400
    assert client.post("/api/v1/auth/send-code", json={"phone": phone}).status_code == 200
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(lambda _: client.post("/api/v1/auth/verify-code", json=body).status_code, range(2)))
    assert sorted(statuses) == [200, 400]
    assert db.execute("SELECT COUNT(*) FROM users WHERE phone=?", ("+86"+phone,)).fetchone()[0] == 1


def test_smtp_sends_code_using_starttls(monkeypatch):
    from app.config import Settings
    from app.emailer import send_verification_email
    import smtplib
    calls = []
    class Server:
        def __init__(self, host, port, timeout):
            calls.append((host, port, timeout))
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def ehlo(self): calls.append("ehlo")
        def starttls(self): calls.append("tls")
        def login(self, username, password): calls.append("login")
        def send_message(self, message): calls.append(message)
    monkeypatch.setattr(smtplib, "SMTP", Server)
    config = Settings(_env_file=None, dev_fixed_login_code="", email_provider="smtp",
        smtp_host="smtp.example.com", smtp_from_email="auth@example.com", smtp_username="user", smtp_password="password")
    send_verification_email(config, "recipient@example.com", "000042", 10)
    assert calls[0] == ("smtp.example.com", 587, 15)
    assert calls[1:5] == ["ehlo", "tls", "ehlo", "login"]
    assert calls[-1]["To"] == "recipient@example.com" and "000042" in calls[-1].get_content()
