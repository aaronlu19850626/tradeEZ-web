from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration for the MT5 communication and email-auth milestone."""

    sync_key: str = "dev-sync-key-change-me"
    db_path: str = "data/tradesync.db"
    cors_origins: str = "*"

    # Email verification-code login
    auth_secret: str = "dev-auth-secret-change-me"
    # Used to encrypt the recoverable sync secret required for HMAC verification.
    sync_key_encryption_secret: str = ""
    access_token_ttl_hours: int = 24 * 7
    email_provider: str = "console"  # console | smtp
    code_ttl_seconds: int = 600
    code_cooldown_seconds: int = 60
    code_max_per_hour: int = 5

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
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