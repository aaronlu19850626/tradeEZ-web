from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, model_validator


class Settings(BaseSettings):
    """Configuration for the MT5 communication and email-auth milestone."""

    sync_key: str = "dev-sync-key-change-me"
    database_url: str = ""
    cors_origins: str = "*"

    # Email verification-code login
    auth_secret: str = "dev-auth-secret-change-me"
    # Used to encrypt the recoverable sync secret required for HMAC verification.
    sync_key_encryption_secret: str = ""
    access_token_ttl_hours: int = 24 * 7
    email_provider: Literal["console", "smtp"] = "console"
    environment: Literal["development", "test", "production"] = "development"
    auth_test_mode: bool = False
    sms_provider: Literal["disabled", "aliyun"] = "disabled"
    aliyun_access_key_id: str = Field(default="", repr=False)
    aliyun_access_key_secret: str = Field(default="", repr=False)
    aliyun_sms_sign_name: str = ""
    aliyun_sms_template_code: str = ""
    aliyun_sms_code_param: str = Field(default="code", pattern=r"^[A-Za-z][A-Za-z0-9_]{0,31}$")
    code_max_per_ip_hour: int = Field(default=30, ge=1)
    code_max_total_per_day: int = Field(default=1000, ge=1)
    code_ttl_seconds: int = Field(default=600, ge=60, le=1800)
    code_cooldown_seconds: int = Field(default=60, ge=30)
    code_max_per_hour: int = Field(default=5, ge=1, le=20)
    dev_fixed_login_code: str = Field(default="", pattern=r"^(|[0-9]{6})$", repr=False)

    # Heartbeat write path. Liveness only needs the latest state, so the
    # append-only history is sampled and pruned instead of being rate limited.
    heartbeat_history_interval_seconds: int = Field(default=300, ge=0)
    heartbeat_write_interval_seconds: int = Field(default=60, ge=0)
    heartbeat_history_retention_days: int = Field(default=30, ge=1)
    heartbeat_history_auto_prune: bool = True

    # Unified connector upgrade policy.
    connector_mt5_min_version: str = "2.0.1"
    connector_mt5_download_url: str = "https://www.tradeez.cn/downloads/tradeezsync-v2.mq5"
    internal_api_token: str = Field(default="", repr=False)

    @model_validator(mode="after")
    def fixed_code_is_console_only(self):
        if self.dev_fixed_login_code and self.email_provider != "console":
            raise ValueError("Fixed test login codes require email_provider=console")
        if self.dev_fixed_login_code not in ("", "123456"):
            raise ValueError("The legacy test code must be 123456; use AUTH_TEST_MODE instead")
        if self.environment == "production":
            if self.auth_test_mode or self.dev_fixed_login_code:
                raise ValueError("Production forbids fixed verification codes")
            if self.email_provider != "smtp" or self.sms_provider != "aliyun":
                raise ValueError("Production requires SMTP and Aliyun SMS")
            if not all((self.smtp_host, self.smtp_from_email, self.aliyun_access_key_id,
                        self.aliyun_access_key_secret, self.aliyun_sms_sign_name, self.aliyun_sms_template_code)):
                raise ValueError("Production email/SMS configuration is incomplete")
            if not (self.smtp_ssl or self.smtp_starttls):
                raise ValueError("Production SMTP requires TLS")
        return self

    @property
    def test_codes_enabled(self) -> bool:
        return self.environment != "production" and (self.auth_test_mode or bool(self.dev_fixed_login_code))

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = Field(default="", repr=False)
    smtp_from_email: str = ""
    smtp_from_name: str = "TradeSync"
    smtp_starttls: bool = True
    smtp_ssl: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="TRADESYNC_",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
