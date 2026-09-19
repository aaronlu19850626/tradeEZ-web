"""Aliyun mainland-China verification SMS; no credentials/codes in logs."""
import json

from .config import Settings


def send_verification_sms(settings: Settings, phone: str, code: str) -> None:
    if settings.sms_provider != "aliyun" or not all((settings.aliyun_access_key_id,
            settings.aliyun_access_key_secret, settings.aliyun_sms_sign_name, settings.aliyun_sms_template_code)):
        raise RuntimeError("SMS is not configured")
    from alibabacloud_dysmsapi20170525.client import Client
    from alibabacloud_dysmsapi20170525.models import SendSmsRequest
    from alibabacloud_tea_openapi.models import Config
    from alibabacloud_tea_util.models import RuntimeOptions

    client = Client(Config(access_key_id=settings.aliyun_access_key_id,
        access_key_secret=settings.aliyun_access_key_secret,
        endpoint="dysmsapi.aliyuncs.com", protocol="HTTPS"))
    response = client.send_sms_with_options(SendSmsRequest(
        phone_numbers=phone.removeprefix("+86"), sign_name=settings.aliyun_sms_sign_name,
        template_code=settings.aliyun_sms_template_code,
        template_param=json.dumps({settings.aliyun_sms_code_param: code}, separators=(",", ":"))),
        RuntimeOptions(connect_timeout=5000, read_timeout=10000, autoretry=False))
    if response.body is None or response.body.code != "OK":
        # Provider exceptions/responses may contain phone numbers or credentials.
        raise RuntimeError("SMS provider rejected the request")
