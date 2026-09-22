from __future__ import annotations

from datetime import date, datetime, timezone
import re
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator

PLATFORM_TZ = ZoneInfo("Asia/Shanghai")
MAX_MT5_LOGIN = 9_223_372_036_854_775_807
MAX_SAFE_JS_INT = 9_007_199_254_740_991
SUPPORTED_CURRENCIES = ("USD", "CNY", "EUR", "GBP", "JPY", "HKD")


def market_profile_for_platform(platform: str) -> str:
    return "cn" if platform.strip().lower() == "ctp" else "fx"


def date_to_epoch(value: date) -> int:
    return int(datetime.combine(value, datetime.min.time(), tzinfo=timezone.utc).timestamp())


def epoch_to_date(value: int | None) -> str | None:
    if not value or int(value) <= 0:
        return None
    return datetime.fromtimestamp(int(value), tz=timezone.utc).date().isoformat()


def platform_today() -> date:
    return datetime.now(PLATFORM_TZ).date()


def iso_to_epoch(value: str | None) -> int | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        return int(datetime.fromisoformat(normalized).timestamp())
    except (ValueError, TypeError):
        return None


def _normalize_name(value: object, field_name: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field_name} 必须为文本")
    value = value.strip()
    if field_name == "name" and not value:
        raise ValueError("账户名称不能为空")
    return value or None


class AccountCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    platform: str = Field(min_length=1, max_length=32)
    currency: str = Field(min_length=3, max_length=3)
    mt5_login: int = Field(gt=0, le=MAX_MT5_LOGIN, strict=True)
    broker_server: str | None = Field(default=None, max_length=120)
    sync_start_date: date | None = None

    @field_validator("name", "broker_server", mode="before")
    @classmethod
    def normalize_text(cls, value, info):
        return _normalize_name(value, info.field_name)

    @field_validator("platform", mode="before")
    @classmethod
    def normalize_platform(cls, value):
        if not isinstance(value, str):
            raise ValueError("交易平台必须为文本")
        normalized = value.strip().lower()
        if not re.fullmatch(r"[a-z0-9_]{1,32}", normalized):
            raise ValueError("交易平台格式无效")
        return normalized

    @field_validator("currency", mode="before")
    @classmethod
    def normalize_currency(cls, value):
        if not isinstance(value, str):
            raise ValueError("币种必须为文本")
        normalized = value.strip().upper()
        if normalized not in SUPPORTED_CURRENCIES:
            raise ValueError("暂不支持该币种")
        return normalized

    @field_validator("mt5_login", mode="before")
    @classmethod
    def coerce_login(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if not value.isascii() or not value.isdigit():
                raise ValueError("MT5 账号必须为整数")
            return int(value)
        return value

    @field_validator("sync_start_date")
    @classmethod
    def not_future(cls, value: date) -> date:
        if value is None:
            return value
        if value > platform_today():
            raise ValueError("同步开始日期不能晚于平台当前日期")
        return value


class AccountUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=80)
    is_statistics: bool | None = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        return _normalize_name(value, "name")


class AccountResetIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    sync_start_date: date

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        return _normalize_name(value, "name")

    @field_validator("sync_start_date")
    @classmethod
    def not_future(cls, value: date) -> date:
        if value > platform_today():
            raise ValueError("同步开始日期不能晚于平台当前日期")
        return value


class AccountDeleteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        return _normalize_name(value, "name")


class AccountOut(BaseModel):
    id: int
    name: str | None
    platform: str
    mt5_login: int
    broker_server: str | None
    currency: str | None
    market_profile: str
    is_statistics: bool
    sync_start_date: str | None
    status: str
    balance: float | None
    equity: float | None
    snapshot_time: int | None
    last_updated_at: int | None
    heartbeat_at: int | None
    ea_status: str
    trade_count: int
    key_prefix: str
    key_environment: str
    key_created_at: str | None
    created_at: str

    @field_serializer("mt5_login", when_used="json")
    def safe_login(self, value: int) -> int | str:
        return str(value) if abs(value) > MAX_SAFE_JS_INT else value


class AccountKeyOut(AccountOut):
    sync_key: str
    message: str


class SyncKeyOut(BaseModel):
    sync_key: str


class ReportEntryOut(BaseModel):
    account: AccountOut
    report: None = None
    message: str
