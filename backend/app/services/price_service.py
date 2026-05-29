"""
Price Service
=============
Fetches OHLCV price data from Yahoo Finance, caches latest prices
in Redis, and persists history to TimescaleDB (prices table).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import pandas as pd
import redis.asyncio as aioredis
import yfinance as yf
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings

settings = get_settings()
log = logging.getLogger(__name__)


# ── Redis client (module-level singleton) ─────────────────────
_redis: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = await aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis


# ── Cache helpers ─────────────────────────────────────────────
async def cache_price(ticker: str, price: float) -> None:
    r = await get_redis()
    await r.setex(f"price:{ticker}", settings.PRICE_CACHE_TTL, str(price))


async def get_cached_price(ticker: str) -> Optional[float]:
    r = await get_redis()
    val = await r.get(f"price:{ticker}")
    return float(val) if val else None


async def publish_price_update(ticker: str, price: float) -> None:
    """Publish to Redis channel so WS manager can relay to clients."""
    r = await get_redis()
    await r.publish("price_updates", json.dumps({"ticker": ticker, "price": price}))


# ── Price fetch ───────────────────────────────────────────────
async def fetch_and_store_prices(
    tickers: list[str],
    db: AsyncSession,
    period: str = "1y",
) -> pd.DataFrame:
    """
    1. Fetch from Yahoo Finance.
    2. Upsert to TimescaleDB.
    3. Cache latest price in Redis + publish update.
    Returns a DataFrame of close prices indexed by date.
    """
    all_tickers = list(set(tickers + [settings.BENCHMARK_TICKER]))

    log.info(f"Fetching prices for: {all_tickers}")
    raw = yf.download(
        tickers=all_tickers,
        period=period,
        auto_adjust=True,
        progress=False,
        threads=True,
    )

    if raw.empty:
        raise ValueError("yfinance returned empty DataFrame")

    # Handle single vs multiple ticker structure
    if len(all_tickers) == 1:
        close = raw[["Close"]].rename(columns={"Close": all_tickers[0]})
    else:
        close = raw["Close"] if "Close" in raw.columns else raw.xs("Close", axis=1, level=0)

    close = close.dropna(how="all")

    # ── Upsert to TimescaleDB ─────────────────────────────────
    rows = []
    for ts, row in close.iterrows():
        for ticker in close.columns:
            val = row[ticker]
            if pd.notna(val):
                rows.append({
                    "ticker": ticker,
                    "ts": ts.to_pydatetime(),
                    "close": float(val),
                })

    if rows:
        upsert_sql = text("""
            INSERT INTO prices (ticker, ts, close)
            VALUES (:ticker, :ts, :close)
            ON CONFLICT (ticker, ts) DO UPDATE SET close = EXCLUDED.close
        """)
        await db.execute(upsert_sql, rows)
        await db.commit()

    # ── Cache latest prices in Redis ──────────────────────────
    for ticker in close.columns:
        latest_price = float(close[ticker].iloc[-1])
        await cache_price(ticker, latest_price)
        await publish_price_update(ticker, latest_price)

    log.info(f"Stored and cached {len(rows)} price rows")
    return close


async def load_price_history(
    tickers: list[str],
    db: AsyncSession,
    days: int = 252,
) -> pd.DataFrame:
    """
    Load price history from TimescaleDB.
    Falls back to yfinance fetch if data is stale.
    """
    all_tickers = list(set(tickers + [settings.BENCHMARK_TICKER]))
    since = datetime.now(timezone.utc) - timedelta(days=days + 30)

    rows = await db.execute(
        text("""
            SELECT ticker, ts, close FROM prices
            WHERE ticker = ANY(:tickers) AND ts >= :since
            ORDER BY ts ASC
        """),
        {"tickers": all_tickers, "since": since},
    )
    data = rows.fetchall()

    if not data:
        # No data in DB — fetch from Yahoo Finance
        return await fetch_and_store_prices(all_tickers, db, period="1y")

    df = pd.DataFrame(data, columns=["ticker", "ts", "close"])
    pivot = df.pivot(index="ts", columns="ticker", values="close")
    pivot.index = pd.to_datetime(pivot.index, utc=True)

    # If last update is older than 6 hours, refresh
    last_update = pivot.index[-1]
    now = datetime.now(timezone.utc)
    if (now - last_update.to_pydatetime()).total_seconds() > 6 * 3600:
        log.info("Price data stale — refreshing from Yahoo Finance")
        try:
            return await fetch_and_store_prices(all_tickers, db, period="1y")
        except Exception as e:
            log.warning(f"Refresh failed, using cached data: {e}")

    return pivot
