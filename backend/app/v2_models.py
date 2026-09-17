from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


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


class HeartbeatRequest(AccountRequest):
    # Display-only MT5 server timezone. v2.1 deal timestamps remain normalized UTC
    # and deals still send server_gmt_off=0.
    server_gmt_offset: int = Field(default=0, ge=-43200, le=43200)
    server_timezone_name: str = Field(default="", max_length=32)


class HeartbeatResponse(BaseModel):
    ok: bool
    server_time: int
