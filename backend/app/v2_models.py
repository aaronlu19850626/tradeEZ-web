from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ApiError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400, details: dict | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


class AccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mt5_login: int = Field(..., gt=0)


class LastSyncTimeResponse(BaseModel):
    last_sync_time: int = Field(..., ge=0)


class DealItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticket: int = Field(..., gt=0)
    position_id: int = Field(..., gt=0)
    order_id: int = Field(..., ge=0)
    symbol: str = Field(..., min_length=1, max_length=64)
    entry: Literal[0, 1, 2, 3]
    type: Literal[0, 1]
    volume: float = Field(..., gt=0)
    price: float = Field(..., gt=0)
    sl_price: float = Field(default=0.0, ge=0)
    tp_price: float = Field(default=0.0, ge=0)
    profit: float = 0.0
    swap: float = 0.0
    commission: float = 0.0
    magic: int = Field(default=0, ge=0)
    comment: str = Field(default="", max_length=500)
    open_time: int = Field(..., gt=0)
    deal_time: int = Field(..., gt=0)


class IngestDealsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mt5_login: int = Field(..., gt=0)
    server_gmt_off: Literal[0] = 0
    deals: list[DealItem] = Field(..., min_length=1, max_length=1000)


class IngestDealsResponse(BaseModel):
    accepted: int
    inserted: int
    duplicates: int


class UpdateLastSyncTimeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mt5_login: int = Field(..., gt=0)
    last_sync_time: int = Field(..., gt=0)


class UpdateLastSyncTimeResponse(BaseModel):
    last_sync_time: int
    updated: bool


class SymbolItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=50)
    digits: int = Field(..., ge=0, le=8)
    point: float = Field(..., gt=0)
    tick_value: float = Field(..., gt=0)
    contract_size: float = Field(..., gt=0)


class IngestSymbolsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mt5_login: int = Field(..., gt=0)
    symbols: list[SymbolItem] = Field(..., min_length=1, max_length=1000)


class IngestSymbolsResponse(BaseModel):
    accepted: int


class SnapshotItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    balance: float
    equity: float
    margin: float = Field(..., ge=0)
    free_margin: float
    snapshot_time: int = Field(..., gt=0)


class IngestSnapshotsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mt5_login: int = Field(..., gt=0)
    snapshots: list[SnapshotItem] = Field(..., min_length=1, max_length=1000)


class IngestSnapshotsResponse(BaseModel):
    accepted: int


class IngestSettingsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mt5_login: int = Field(..., gt=0)
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


class HeartbeatResponse(BaseModel):
    ok: bool
    server_time: int
