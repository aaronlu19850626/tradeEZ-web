from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Mt5Login = Annotated[int, Field(gt=0, le=9223372036854775807, strict=True)]


class ApiError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400, details: dict | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


class AccountRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    mt5_login: Mt5Login
    # Optional in v2.2. Old EAs omit these and continue using the legacy path.
    instance_id: str | None = Field(default=None, min_length=1, max_length=80)
    instance_name: str | None = Field(default=None, max_length=120)
    protocol_version: str | None = Field(default=None, max_length=20)
    ea_version: str | None = Field(default=None, max_length=40)


class LastSyncTimeResponse(BaseModel):
    cursor_basis: Literal["out_deal_time"] = "out_deal_time"
    last_sync_time: int = Field(..., ge=0)
    account_status: str = "active"
    sync_run_id: int
    cursor: int = Field(..., ge=0)
    protocol_version: str = "2.2"
    min_protocol_version: str = "2.1"
    capabilities: list[str] = Field(default_factory=lambda: [
        "hmac_sha256",
        "idempotent_batches",
        "two_phase_cursor",
        "batch_handshake_v2",
    ])
    max_batch_size: int = 1000


class DealItem(BaseModel):
    model_config = ConfigDict(extra="ignore", allow_inf_nan=False)

    ticket: int = Field(..., gt=0, le=9223372036854775807, strict=True)
    position_id: int = Field(..., gt=0, le=9223372036854775807, strict=True)
    order_id: int = Field(..., ge=0, le=9223372036854775807, strict=True)
    symbol: str = Field(..., min_length=1, max_length=64)
    entry: Literal[0, 1, 2, 3]
    type: int = Field(..., ge=0, strict=True)
    volume: float = Field(..., ge=0)
    price: float = Field(..., ge=0)
    sl_price: float = Field(default=0.0, ge=0)
    tp_price: float = Field(default=0.0, ge=0)
    profit: float = 0.0
    swap: float = 0.0
    commission: float = 0.0
    magic: int = Field(default=0, ge=0, le=9223372036854775807, strict=True)
    comment: str = Field(default="", max_length=2000)
    open_time: int = Field(..., gt=0)
    deal_time: int = Field(..., gt=0)
    server_open_time: int | None = Field(default=None, gt=0)
    server_deal_time: int | None = Field(default=None, gt=0)
    server_gmt_offset: int | None = Field(default=None, ge=-43200, le=43200)


class IngestDealsRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    mt5_login: Mt5Login
    server_gmt_off: Literal[0] = 0
    deals: list[DealItem] = Field(..., min_length=1, max_length=1000)

    sync_run_id: int | None = Field(default=None, gt=0)
    batch_id: str | None = Field(default=None, min_length=8, max_length=120)
    batch_index: int | None = Field(default=None, ge=0)
    batch_count: int | None = Field(default=None, ge=1, le=1000)
    instance_id: str | None = Field(default=None, min_length=1, max_length=80)
    protocol_version: str | None = Field(default=None, max_length=20)
    request_hash: str | None = Field(default=None, min_length=8, max_length=128)


class IngestDealsResponse(BaseModel):
    accepted: int
    inserted: int = 0
    updated: int = 0
    duplicates: int = 0
    duplicated: int = 0
    rejected: int = 0
    pending_cursor: int | None = None
    sync_run_id: int | None = None
    batch_id: str | None = None
    batch_status: str = "accepted"
    handshake: str = "batch_received"
    replayed: bool = False


class UpdateLastSyncTimeRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    mt5_login: Mt5Login
    last_sync_time: int = Field(..., ge=0)

    sync_run_id: int | None = Field(default=None, gt=0)
    batch_count: int | None = Field(default=None, ge=0, le=1000)
    deal_count: int | None = Field(default=None, ge=0, le=1_000_000)
    batch_hash: str | None = Field(default=None, min_length=8, max_length=128)
    instance_id: str | None = Field(default=None, min_length=1, max_length=80)
    protocol_version: str | None = Field(default=None, max_length=20)


class UpdateLastSyncTimeResponse(BaseModel):
    last_sync_time: int
    updated: bool
    sync_run_id: int | None = None
    handshake_confirmed: bool = False
    batches_received: int = 0
    batches_expected: int = 0
    deals_received: int = 0
    checksum_valid: bool | None = None


class SymbolItem(BaseModel):
    model_config = ConfigDict(extra="ignore", allow_inf_nan=False)

    name: str = Field(..., min_length=1, max_length=50)
    digits: int = Field(..., ge=0, le=8)
    point: float = Field(..., gt=0)
    tick_value: float = Field(..., ge=0)
    contract_size: float = Field(..., gt=0)


class IngestSymbolsRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    mt5_login: Mt5Login
    symbols: list[SymbolItem] = Field(..., min_length=1, max_length=1000)


class IngestSymbolsResponse(BaseModel):
    accepted: int


class SnapshotItem(BaseModel):
    model_config = ConfigDict(extra="ignore", allow_inf_nan=False)

    balance: float
    equity: float
    margin: float = Field(..., ge=0)
    free_margin: float
    snapshot_time: int = Field(..., gt=0)


class IngestSnapshotsRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    mt5_login: Mt5Login
    snapshots: list[SnapshotItem] = Field(..., min_length=1, max_length=1000)


class IngestSnapshotsResponse(BaseModel):
    accepted: int


class IngestSettingsRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    mt5_login: Mt5Login
    snapshot_time: int = Field(..., gt=0)
    settings: dict[str, dict[str, object]] = Field(..., min_length=1, max_length=20)

    @field_validator("settings")
    @classmethod
    def validate_settings(cls, value: dict[str, dict[str, object]]) -> dict[str, dict[str, object]]:
        total_keys = 0
        for group_name, group in value.items():
            if group_name != group_name.strip() or not group_name.strip() or len(group_name) > 64:
                raise ValueError("settings group name must be 1-64 characters without surrounding whitespace")
            if not isinstance(group, dict) or not group:
                raise ValueError("settings group must be a non-empty object")
            total_keys += len(group)
        if total_keys > 300:
            raise ValueError("too many settings keys")
        return value


class SettingsAckData(BaseModel):
    received_at: int


class IngestSettingsResponse(BaseModel):
    code: int = 0
    message: str = "ok"
    data: SettingsAckData


class HeartbeatRequest(AccountRequest):
    # Display-only MT5 server timezone. v2.1 deal timestamps remain normalized UTC
    # and deals still send server_gmt_off=0.
    server_gmt_offset: int | None = Field(default=None, ge=-43200, le=43200)
    server_timezone_name: str | None = Field(default=None, max_length=32)
    account_currency: str | None = Field(default=None, max_length=10)
    broker_company: str | None = Field(default=None, max_length=120)
    broker_server: str | None = Field(default=None, max_length=120)


class HeartbeatResponse(BaseModel):
    ok: bool
    server_time: int
