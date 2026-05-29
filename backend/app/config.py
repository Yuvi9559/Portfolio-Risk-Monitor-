from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ── App ──────────────────────────────────────────────────
    APP_NAME: str = "Portfolio Risk Monitor"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # ── Database ─────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@db:5432/portfoliodb"
    DATABASE_URL_SYNC: str = "postgresql://postgres:postgres@db:5432/portfoliodb"

    # ── Redis ────────────────────────────────────────────────
    REDIS_URL: str = "redis://redis:6379/0"

    # ── JWT ──────────────────────────────────────────────────
    SECRET_KEY: str = "change-me-in-production-use-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # ── Risk Engine ──────────────────────────────────────────
    LOOKBACK_DAYS: int = 252          # 1 trading year for risk calculations
    RISK_FREE_RATE: float = 0.05      # 5% annual
    VAR_CONFIDENCE: float = 0.95
    BENCHMARK_TICKER: str = "SPY"

    # ── Price Refresh ────────────────────────────────────────
    PRICE_REFRESH_INTERVAL: int = 60  # seconds
    PRICE_CACHE_TTL: int = 55         # Redis TTL seconds

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
