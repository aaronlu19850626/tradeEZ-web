from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(value: str) -> str:
    value = value.strip().lower()
    if not EMAIL_PATTERN.fullmatch(value):
        raise ValueError("Invalid email address")
    return value


class SendCodeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)


class VerifyCodeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    code: str = Field(..., min_length=4, max_length=10)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        value = value.strip()
        if not value.isdigit():
            raise ValueError("Verification code must contain digits only")
        return value


class SendCodeOut(BaseModel):
    message: str
    expires_in: int
    cooldown_seconds: int


class UserOut(BaseModel):
    id: int
    email: str
    created_at: str
    last_login_at: str | None = None


class VerifyCodeOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    is_new_user: bool
    user: UserOut


class AccountCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mt5_login: int = Field(..., gt=0)
    label: str | None = Field(default=None, max_length=80)
    broker_server: str | None = Field(default=None, max_length=120)
    account_currency: str | None = Field(default=None, max_length=10)
    server_gmt_off: int | None = Field(default=None, ge=-43200, le=43200)

    @field_validator("label", "broker_server", "account_currency")
    @classmethod
    def blank_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class AccountOut(BaseModel):
    id: int
    user_id: int
    mt5_login: int
    label: str | None = None
    broker_server: str | None = None
    broker_company: str | None = None
    account_currency: str | None = None
    server_gmt_off: int | None = None
    server_timezone_name: str | None = None
    key_prefix: str
    key_environment: str = "live"
    key_created_at: str | None = None
    key_last_used_at: str | None = None
    last_seen_at: str | None = None
    created_at: str
    last_sync_time: int = 0
    deal_count: int = 0
    synced_order_count: int = 0
    latest_deal_time: int | None = None
    symbol_count: int = 0
    snapshot_count: int = 0
    latest_snapshot_time: int | None = None
    latest_equity: float | None = None


class AccountKeyOut(AccountOut):
    sync_key: str
    message: str


class DealIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticket: int = Field(..., ge=0)
    position_id: int | None = Field(default=None, ge=0)
    order_id: int | None = Field(default=None, ge=0)
    symbol: str | None = None
    entry: Literal[0, 1, 2]
    type: int = Field(..., ge=0)
    volume: float = Field(..., ge=0)
    price: float = Field(..., ge=0)
    sl_price: float | None = Field(default=None, ge=0)
    tp_price: float | None = Field(default=None, ge=0)
    profit: float = 0
    swap: float = 0
    commission: float = 0
    magic: int = Field(default=0, ge=0)
    comment: str | None = None
    deal_time: int = Field(..., ge=0)

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class DealBatchIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    account_login: int = Field(..., ge=0)
    server_gmt_off: int | None = None
    deals: list[DealIn] = Field(..., min_length=1, max_length=500)


class DealItemResult(BaseModel):
    ticket: int
    status: Literal["accepted", "duplicated"]


class DealBatchOut(BaseModel):
    account_login: int
    accepted: int
    duplicated: int
    rejected: int = 0
    max_ticket: int | None
    items: list[DealItemResult]


class HeartbeatIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    account_login: int = Field(..., ge=0)
    server_gmt_off: int | None = None
    account_currency: str | None = None
    broker_company: str | None = None
    broker_server: str | None = None
    ea_version: str | None = None


class HeartbeatOut(BaseModel):
    account_login: int
    status: str = "ok"
    last_seen_at: str


class DealOut(BaseModel):
    id: int
    account_login: int
    ticket: int
    position_id: int | None
    order_id: int | None
    symbol: str | None
    entry: int
    type: int
    volume: float
    price: float
    sl_price: float | None
    tp_price: float | None
    profit: float
    swap: float
    commission: float
    magic: int
    comment: str | None
    open_time: int = 0
    deal_time: int
    server_gmt_off: int | None
    received_at: str

    model_config = ConfigDict(from_attributes=True)


class PositionOut(BaseModel):
    account_login: int
    position_id: int
    symbol: str
    strategy: str
    direction: str
    volume_in: float
    volume_out: float
    open_price: float | None
    close_price: float | None
    sl_price: float | None
    tp_price: float | None
    swap_total: float
    commission_total: float
    net_pnl: float
    open_time: int | None
    close_time: int | None
    hold_seconds: int | None
    is_closed: bool
    magic: int | None
    comment: str | None


class MessageOut(BaseModel):
    message: str


class ApiLogOut(BaseModel):
    id: int
    created_at: str
    user_id: int | None = None
    account_id: int | None = None
    mt5_login: int | None = None
    method: str
    path: str
    action: str
    status_code: int
    success: bool
    duration_ms: int
    item_count: int | None = None
    last_sync_time: int | None = None
    request_summary: dict = {}
    response_summary: dict = {}
    error_code: str | None = None
    error_message: str | None = None
    client_ip: str | None = None
