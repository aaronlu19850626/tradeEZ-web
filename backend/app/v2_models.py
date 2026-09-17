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


class LastSyncTimeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mt5_login: int = Field(..., gt=0)


class LastSyncTimeResponse(BaseModel):
    last_sync_time: int = Field(..., ge=0)


class V2Deal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    deal_ticket: int = Field(..., gt=0)
    order_ticket: int = Field(..., ge=0)
    position_id: int = Field(..., ge=0)
    symbol: str = Field(..., min_length=1, max_length=50)
    deal_type: Literal["BUY", "SELL"]
    entry_type: Literal["IN", "OUT", "INOUT"]
    deal_time: int = Field(..., gt=0)
    price: float = Field(..., gt=0)
    volume: float = Field(..., gt=0)
    commission: float = 0.0
    swap: float = 0.0
    profit: float = 0.0
    sl: float = Field(default=0.0, ge=0)
    tp: float = Field(default=0.0, ge=0)
    comment: str | None = Field(default="", max_length=500)
    magic: int = Field(default=0, ge=0)


class IngestDealsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mt5_login: int = Field(..., gt=0)
    server_gmt_off: int
    last_deal_time: int = Field(..., gt=0)
    deals: list[V2Deal] = Field(..., min_length=1, max_length=1000)

class IngestDealsResponse(BaseModel):
    accepted: int
    inserted: int
    duplicates: int
    last_sync_time_updated: int


class V2Symbol(BaseModel):
    model_config = ConfigDict(extra="forbid")

    symbol: str = Field(..., min_length=1, max_length=50)
    digits: int = Field(..., ge=0, le=8)
    point: float = Field(..., gt=0)
    contract_size: float = Field(..., gt=0)
    tick_value: float = Field(..., gt=0)
    tick_size: float = Field(..., gt=0)
    currency_base: str = Field(..., min_length=1, max_length=10)
    currency_profit: str = Field(..., min_length=1, max_length=10)


class IngestSymbolsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mt5_login: int = Field(..., gt=0)
    symbols: list[V2Symbol] = Field(..., min_length=1, max_length=1000)

class IngestSymbolsResponse(BaseModel):
    accepted: int
    upserted: int


class SnapshotRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mt5_login: int = Field(..., gt=0)
    timestamp: int = Field(..., gt=0)
    balance: float
    equity: float
    margin: float = Field(..., ge=0)
    free_margin: float
    margin_level: float = Field(..., ge=0)


class SnapshotResponse(BaseModel):
    accepted: bool


class HeartbeatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mt5_login: int = Field(..., gt=0)
    timestamp: int = Field(..., gt=0)
    version: str | None = Field(default=None, max_length=20)


class HeartbeatResponse(BaseModel):
    received: bool