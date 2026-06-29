from __future__ import annotations

import logging
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

# ── Build async-compatible URL ────────────────────────────────────────────────
def _make_async_url(url: str) -> str:
    """Convert a plain postgresql:// URL to postgresql+asyncpg://."""
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


ASYNC_DATABASE_URL = _make_async_url(settings.DATABASE_URL)

# Strip sslmode query parameter if present to avoid asyncpg TypeError
if "?sslmode=" in ASYNC_DATABASE_URL:
    ASYNC_DATABASE_URL = ASYNC_DATABASE_URL.split("?sslmode=")[0]
elif "&sslmode=" in ASYNC_DATABASE_URL:
    ASYNC_DATABASE_URL = ASYNC_DATABASE_URL.split("&sslmode=")[0]

connect_args = {}
if "neon.tech" in ASYNC_DATABASE_URL or "aws.neon.tech" in ASYNC_DATABASE_URL:
    connect_args["ssl"] = True

# ── Engine ────────────────────────────────────────────────────────────────────
engine = create_async_engine(
    ASYNC_DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    echo=settings.DEBUG,
    future=True,
    connect_args=connect_args,
)

# ── Session factory ───────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


# ── Declarative base ──────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ── Dependency ────────────────────────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
