from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(
        default="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
    )
    redis_url: str = Field(default="redis://127.0.0.1:6379")
    github_fallback_token: str | None = None
    sentry_dsn: str | None = None
    sample_size_default: int = 2000
    sample_threshold: int = 5000
    profile_cache_ttl_days: int = 7


settings = Settings()
