from __future__ import annotations

import logging
import contextlib
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.config import get_settings
from app.database import Base, engine, get_db
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
    # Retry database initialization up to 5 times
    db_initialized = False
    for attempt in range(1, 6):
        try:
            logger.info("Database initialization attempt %d/5...", attempt)
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("Database tables ready.")
            db_initialized = True
            break
        except Exception as exc:
            logger.warning("Database connection attempt %d failed: %s", attempt, exc)
            if attempt < 5:
                import asyncio
                await asyncio.sleep(3)
            else:
                logger.critical("Database initialization failed after 5 attempts.")

    if db_initialized:
        try:
            # Seed top traders data
            from app.services.edgar_service import seed_traders
            from app.database import AsyncSessionLocal
            async with AsyncSessionLocal() as session:
                await seed_traders(session)
        except Exception as exc:
            logger.error("Failed to seed traders: %s", exc)
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

# ── Global Exception Handler (CORS-Compliant Error Responses) ─────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception occurred: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
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
async def health(db: AsyncSession = Depends(get_db)) -> dict:
    db_status = "ok"
    db_error = None
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        db_status = "error"
        db_error = str(exc)
        logger.error("Health check database failure: %s", exc)

    return {
        "status": "ok" if db_status == "ok" else "error",
        "database": db_status,
        "database_error": db_error,
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }

