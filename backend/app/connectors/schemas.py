from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

EVENT_TYPES = (
    "instrument",
    "trade",
    "order",
    "position",
    "account_snapshot",
    "heartbeat",
    "settings",
)


class HandshakeRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    platform: str = Field(min_length=1, max_length=32)
    account_ref: str = Field(min_length=1, max_length=120)
    instance_id: str | None = Field(default=None, max_length=80)
    connector_version: str | None = Field(default=None, max_length=40)


class CursorOut(BaseModel):
    basis: str
    value: int
    state: dict[str, Any]


class UpgradeInfo(BaseModel):
    required: bool
    required_version: str
    download_url: str
    message: str


class HandshakeResponse(BaseModel):
    connection_id: str
    platform: str
    protocol_version: str
    capabilities: list[str]
    limits: dict[str, int]
    cursor: CursorOut
    upgrade: UpgradeInfo | None = None


class EventItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    event_id: str = Field(min_length=1, max_length=160)
    type: Literal[
        "instrument",
        "trade",
        "order",
        "position",
        "account_snapshot",
        "heartbeat",
        "settings",
    ]
    occurred_at: int = Field(ge=0)
    data: dict[str, Any] = Field(default_factory=dict)


class EventBatchRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    batch_id: str = Field(min_length=1, max_length=160)
    batch_index: int = Field(ge=0)
    batch_count: int = Field(ge=1)
    idempotency_key: str | None = Field(default=None, max_length=160)
    events: list[EventItem] = Field(min_length=1, max_length=5000)


class EventBatchResponse(BaseModel):
    accepted: int
    inserted: int
    duplicates: int
    rejected: int = 0
    cursor: CursorOut
    replay: bool
