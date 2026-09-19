from __future__ import annotations

import json
import smtplib
import sys
from email.message import EmailMessage
from pathlib import Path

from .config import Settings


def send_verification_email(settings: Settings, to_email: str, code: str, ttl_minutes: int) -> None:
    subject = "TradeSync 登录验证码"
    body = (
        f"你的 TradeSync 验证码是：{code}\n\n"
        f"验证码 {ttl_minutes} 分钟内有效，请勿泄露给他人。\n"
        "如果不是你本人操作，请忽略这封邮件。\n"
    )

    if settings.email_provider.lower() == "console":
        _send_console(to_email, code, subject, body, settings)
        return

    if settings.email_provider.lower() == "smtp":
        _send_smtp(settings, to_email, subject, body)
        return

    raise ValueError(f"Unsupported email provider: {settings.email_provider}")


def _send_console(to_email: str, code: str, subject: str, body: str, settings: Settings) -> None:
    print("\n========== TradeSync 开发模式验证码 ==========", flush=True)
    print(f"To: {to_email}", flush=True)
    print(f"Subject: {subject}", flush=True)
    print(body, flush=True)
    print("============================================\n", flush=True)

    # Convenience for local development only. This directory is git-ignored.
    dev_dir = Path(__file__).resolve().parents[1] / "data" / "dev-codes"
    dev_dir.mkdir(parents=True, exist_ok=True)
    latest = dev_dir / "latest.json"
    latest.write_text(
        json.dumps({"email": to_email.lower(), "code": code}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _send_smtp(settings: Settings, to_email: str, subject: str, body: str) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("SMTP provider selected but SMTP_HOST or SMTP_FROM_EMAIL is not configured")

    message = EmailMessage()
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    if settings.smtp_ssl:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            _login_and_send(server, message, settings, to_email)
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        server.ehlo()
        if settings.smtp_starttls:
            server.starttls()
            server.ehlo()
        _login_and_send(server, message, settings, to_email)


def _login_and_send(server: smtplib.SMTP, message: EmailMessage, settings: Settings, to_email: str) -> None:
    if settings.smtp_username:
        server.login(settings.smtp_username, settings.smtp_password)
    server.send_message(message)