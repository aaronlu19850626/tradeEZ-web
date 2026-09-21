from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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
