from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# Namespaces are namespaced strings such as "trade-center.columns".
NAMESPACE_PATTERN = r"^[a-z0-9][a-z0-9._-]{0,63}$"
MAX_PAYLOAD_BYTES = 32_768


class PreferenceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payload: dict[str, Any] = Field(default_factory=dict)


class PreferenceOut(BaseModel):
    namespace: str
    payload: dict[str, Any] | None
    updated_at: str | None
