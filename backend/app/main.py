from __future__ import annotations

import logging
import contextlib
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import Base, engine
from app.routers import auth, export, news, portfolios, risk, traders, websocket

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create all DB tables on startup."""
    logger.info("Starting up %s v%s …", settings.APP_NAME, settings.APP_VERSION)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables ready.")

        # Seed top traders data
        from app.services.edgar_service import seed_traders
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            await seed_traders(session)
    except Exception as exc:
        logger.critical("Database initialization failed: %s", exc)
    yield
    logger.info("Shutting down …")
    await engine.dispose()


# ── App factory ───────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Portfolio Risk Monitor Pro – real-time risk analytics for multi-asset portfolios.",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(portfolios.router)
app.include_router(risk.router)
app.include_router(news.router)
app.include_router(export.router)
app.include_router(traders.router)
app.include_router(websocket.router)


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health() -> dict:
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }
