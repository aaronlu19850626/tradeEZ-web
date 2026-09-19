from __future__ import annotations

import re
import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, field_serializer, model_validator


class WebIdentityModel(BaseModel):
    """Keep 64-bit Python integers; protect identifiers in browser JSON responses."""

    @field_serializer("ticket", "position_id", "order_id", "magic", "account_login", "mt5_login", "anchor_ticket", "deal_ticket",
                      check_fields=False, when_used="json")
    def safe_identity(self, value: int | None) -> int | str | None:
        return str(value) if value is not None and abs(value) > 9007199254740991 else value

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(value: str) -> str:
    value = value.strip().lower()
    if not EMAIL_PATTERN.fullmatch(value):
        raise ValueError("Invalid email address")
    return value


class SendCodeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=20)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        return normalize_email(value) if value is not None else None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if value.startswith("+86"):
            value = value[3:]
        if not re.fullmatch(r"1[3-9][0-9]{9}", value):
            raise ValueError("请输入中国大陆 11 位手机号")
        return "+86" + value

    @model_validator(mode="after")
    def one_identity(self):
        if (self.email is None) == (self.phone is None):
            raise ValueError("请仅填写手机号或邮箱其中一项")
        return self

    @property
    def identity(self) -> str:
        return self.email if self.email is not None else "phone:" + self.phone


class VerifyCodeIn(SendCodeIn):
    code: str = Field(..., min_length=6, max_length=6)

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(r"[0-9]{6}", value):
            raise ValueError("请输入 6 位数字验证码")
        return value


class SendCodeOut(BaseModel):
    message: str
    expires_in: int
    cooldown_seconds: int


class UserOut(BaseModel):
    id: int
    email: str | None
    phone: str | None = None
    created_at: str
    last_login_at: str | None = None

    @model_validator(mode="before")
    @classmethod
    def expose_contacts(cls, value):
        if isinstance(value, dict) and value.get("phone"):
            value = {**value, "email": None}
        return value


class VerifyCodeOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    is_new_user: bool
    user: UserOut


class AccountConfiguration(BaseModel):
    @field_validator("notes", mode="before", check_fields=False)
    @classmethod
    def normalize_notes(cls, value):
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("账户备注必须为文本")
        return value.strip() or None

    @field_validator("label", "broker_server", "account_currency", "server_timezone_name", mode="before", check_fields=False)
    @classmethod
    def normalize_configuration(cls, value, info):
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("Expected text")
        value = value.strip()
        if info.field_name == "broker_server" and not value:
            raise ValueError("Broker server is required")
        if not value:
            return None
        if info.field_name == "account_currency":
            value = value.upper()
            if not re.fullmatch(r"[A-Z][A-Z0-9]{1,9}", value):
                raise ValueError("Currency must use 2–10 letters or digits")
        if info.field_name == "server_timezone_name":
            try:
                ZoneInfo(value)
            except (ZoneInfoNotFoundError, ValueError):
                raise ValueError("Use a valid IANA timezone, for example Europe/Helsinki")
        return value

    @field_validator("sync_start_time", mode="before", check_fields=False)
    @classmethod
    def validate_sync_start(cls, value):
        if value is None:
            return value
        # The SOP and main EA upload Unix UTC timestamps.
        if type(value) is not int or value < 0 or value > int(time.time()):
            raise ValueError("Sync start must be an integer timestamp and cannot be in the future")
        return value


class AccountCreateIn(AccountConfiguration):
    model_config = ConfigDict(extra="forbid")

    mt5_login: int = Field(..., gt=0, le=9223372036854775807)
    label: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=2000)
    broker_server: str = Field(..., min_length=1, max_length=120)
    account_currency: str | None = Field(default=None, max_length=10)
    server_gmt_off: int | None = Field(default=None, ge=-43200, le=43200)
    server_timezone_name: str | None = Field(default=None, max_length=64)
    sync_start_time: int = Field(..., ge=0)

    @field_validator("mt5_login", mode="before")
    @classmethod
    def precise_login(cls, value):
        if type(value) is int or (isinstance(value, str) and value.isascii() and value.isdigit()):
            return value
        raise ValueError("MT5 login must be an integer or decimal digit string")

    @field_validator("label", "broker_server", "account_currency")
    @classmethod
    def blank_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class AccountOut(WebIdentityModel):
    id: int
    user_id: int
    mt5_login: int
    label: str | None = None
    notes: str | None = None
    config_revision: int = 0
    broker_server: str | None = None
    broker_company: str | None = None
    account_currency: str | None = None
    server_gmt_off: int | None = None
    server_timezone_name: str | None = None
    status: str = "active"
    sync_start_time: int = 0
    last_success_sync_at: str | None = None
    key_prefix: str
    key_environment: str = "live"
    key_created_at: str | None = None
    key_last_used_at: str | None = None
    last_seen_at: str | None = None
    created_at: str
    last_sync_time: int = 0
    deal_count: int = 0
    synced_order_count: int = 0
    resync_pending: bool = False
    sync_start_locked: bool = False
    complete_trade_count: int = 0
    review_trade_count: int = 0
    reconciliation_untracked_count: int = 0
    reconciliation_open_count: int = 0
    reconciliation_investigating_count: int = 0
    reconciliation_resolved_count: int = 0
    latest_close_time: int | None = None
    latest_deal_time: int | None = None
    symbol_count: int = 0
    snapshot_count: int = 0
    latest_snapshot_time: int | None = None
    latest_equity: float | None = None
    settings_count: int = 0
    latest_settings_time: int | None = None
    sync_auth_error_active: bool = False
    sync_auth_error_code: str | None = None
    sync_auth_error_at: str | None = None


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


class DealOut(WebIdentityModel):
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


class DealSourceBatchOut(BaseModel):
    sync_run_id: int
    batch_id: str
    batch_index: int
    status: str
    received_at: str


class DealDetailOut(BaseModel):
    deal: DealOut
    source_batches: list[DealSourceBatchOut]
    source_total: int
    page: int
    page_size: int


class OrderPageOut(BaseModel):
    items: list[TradeOut]
    total: int
    page: int
    page_size: int
    server_timezone_name: str | None = None
    account_currency: str | None = None


class RawDealPageOut(BaseModel):
    items: list[DealOut]
    total: int
    page: int
    page_size: int


class PositionOut(WebIdentityModel):
    reconciliation_status: Literal["complete", "partial", "needs_review"] = "complete"
    reconciliation_issues: list[str] = Field(default_factory=list)
    remaining_volume: float = 0
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


class TradeOut(PositionOut):
    trade_id: int
    anchor_ticket: int
    review_status: Literal["unwritten", "draft", "reviewed"] = "unwritten"
    review_source_changed: bool = False
    setup_id: int | None = None
    setup_name: str | None = None
    playbook_version: int | None = None
    evaluation_complete: bool | None = None
    execution_coverage: float | None = None
    execution_score: float | None = None
    execution_compliance: Literal["compliant", "violations", "insufficient"] | None = None
    critical_failures: list[str] = Field(default_factory=list)
    reconciliation_case_state: Literal["open", "investigating", "resolved"] | None = None
    reconciliation_resolution: Literal["source_confirmed", "awaiting_resync", "not_a_trade"] | None = None
    reconciliation_note: str | None = None
    reconciliation_updated_at: str | None = None


class TradeAllocationOut(WebIdentityModel):
    deal_ticket: int
    role: str
    volume: float
    profit: float
    swap: float
    commission: float
    method: str


class TradeDetailOut(BaseModel):
    trade: TradeOut
    allocations: list[TradeAllocationOut]
    total: int
    page: int
    page_size: int


class MessageOut(BaseModel):
    message: str


class EaSettingsSnapshotOut(WebIdentityModel):
    id: int
    account_login: int
    snapshot_time: int
    settings: dict
    group_count: int
    key_count: int
    received_at: int
    content_hash: str
    @field_serializer("settings", when_used="json")
    def safe_settings(self, value: dict) -> dict:
        def convert(item):
            if type(item) is int and abs(item) > 9007199254740991:
                return str(item)
            if isinstance(item, dict):
                return {key: ("[已隐藏]" if re.search(r"secret|password|passwd|token|api.?key|sync.?key|authorization", key, re.I)
                              else convert(child)) for key, child in item.items()}
            if isinstance(item, list):
                return [convert(child) for child in item]
            return item
        return convert(value)


class SnapshotPointOut(BaseModel):
    timestamp: int
    balance: float
    equity: float
    margin: float
    free_margin: float
    margin_level: float | None = None


class SnapshotSeriesOut(BaseModel):
    account_id: int
    currency: str | None = None
    total: int
    start_time: int | None = None
    end_time: int | None = None
    limit: int
    items: list[SnapshotPointOut]


class SymbolSpecOut(BaseModel):
    symbol: str
    digits: int
    point: float
    tick_size: float
    tick_value: float
    contract_size: float
    currency_base: str | None = None
    currency_profit: str | None = None
    updated_at: str


class SymbolSpecPageOut(BaseModel):
    items: list[SymbolSpecOut]
    total: int
    page: int
    page_size: int



class SyncOverviewAccountRef(WebIdentityModel):
    id: int
    mt5_login: int
    label: str | None = None


class SyncOverviewSignalAccount(SyncOverviewAccountRef):
    last_sync_time: int | None = None
    latest_close_time: int | None = None
    last_seen_at: str | None = None
    seconds_since_heartbeat: int | None = None
    sync_auth_error_code: str | None = None
    sync_auth_error_at: str | None = None


class SyncOverviewAccounts(BaseModel):
    total: int = 0
    active: int = 0
    disabled: int = 0
    resync_pending: int = 0


class SyncOverviewTrades(BaseModel):
    complete: int = 0
    partial: int = 0
    needs_review: int = 0
    reconciliation_untracked: int = 0
    reconciliation_open: int = 0
    reconciliation_investigating: int = 0
    reconciliation_resolved: int = 0


class SyncOverviewRuns(BaseModel):
    open: int = 0
    committed: int = 0
    expired: int = 0
    failed: int = 0


class SyncOverviewOut(BaseModel):
    generated_at: int
    heartbeat_stale_after: int
    accounts: SyncOverviewAccounts
    trades: SyncOverviewTrades
    runs: SyncOverviewRuns
    cursor_uncommitted: list[SyncOverviewSignalAccount]
    heartbeat_stale: list[SyncOverviewSignalAccount]
    auth_errors: list[SyncOverviewSignalAccount]
    resync_pending_accounts: list[SyncOverviewAccountRef]
    disabled_accounts: list[SyncOverviewAccountRef]

class ApiLogOut(WebIdentityModel):
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
    trace_id: str | None = None
    sync_run_id: int | None = None
    batch_id: str | None = None
    inserted_count: int | None = None
    updated_count: int | None = None
    duplicated_count: int | None = None
    rejected_count: int | None = None


class AccountUpdateIn(AccountConfiguration):
    model_config = ConfigDict(extra="forbid")

    label: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=2000)
    expected_revision: int | None = Field(default=None, ge=0, strict=True)
    broker_server: str | None = Field(default=None, min_length=1, max_length=120)
    account_currency: str | None = Field(default=None, max_length=10)
    status: Literal["active", "disabled"] | None = None
    sync_start_time: int | None = Field(default=None, ge=0)
    server_timezone_name: str | None = Field(default=None, max_length=64)


class AccountMaintenanceIn(AccountConfiguration):
    model_config = ConfigDict(extra="forbid")
    confirm_login: str = Field(min_length=1, max_length=19, pattern=r"^[0-9]+$")
    revision: str = Field(min_length=64, max_length=64)
    # Optional operator note; the maintenance audit itself always records who/when/impact.
    reason: str | None = Field(default=None, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def normalize_reason(cls, value):
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("操作原因必须为文本")
        value = value.strip()
        if not value:
            return None
        if len(value) < 3:
            raise ValueError("操作原因至少需要 3 个字符")
        return value


class AccountResetIn(AccountMaintenanceIn):
    sync_start_time: int = Field(ge=0)


class SyncRunOut(BaseModel):
    id: int
    account_id: int
    instance_id: str | None = None
    protocol_version: str
    status: str
    cursor_start: int
    cursor_end: int | None = None
    expected_batch_count: int | None = None
    received_batch_count: int
    expected_deal_count: int | None = None
    received_deal_count: int
    inserted_count: int
    updated_count: int
    duplicated_count: int
    rejected_count: int
    checksum: str | None = None
    last_error: str | None = None
    started_at: str
    last_batch_at: str | None = None
    committed_at: str | None = None
    finished_at: str | None = None


class SyncRunPageOut(BaseModel):
    items: list[SyncRunOut]
    total: int
    page: int
    page_size: int


class SyncBatchOut(BaseModel):
    id: int
    batch_id: str
    batch_index: int
    batch_count: int
    item_count: int
    inserted_count: int
    updated_count: int
    duplicated_count: int
    rejected_count: int
    status: str
    retries: int
    received_at: str


class SyncRunDetailOut(BaseModel):
    run: SyncRunOut
    batches: list[SyncBatchOut]
    total: int
    page: int
    page_size: int
