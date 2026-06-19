from __future__ import annotations

import asyncio
import logging
from typing import List, Optional

import pandas as pd
import yfinance as yf

from app.config import get_settings

logger = logging.getLogger(__name__)

# ── Optional Redis caching ────────────────────────────────────────────────────
try:
    import redis.asyncio as aioredis
    from app.config import get_settings as _get_settings

    _settings = _get_settings()
    _redis_client: aioredis.Redis | None = aioredis.from_url(
        _settings.REDIS_URL, decode_responses=True
    )
except Exception:
    _redis_client = None
    logger.warning("Redis not available – price caching disabled.")

_PRICE_TTL = 60  # seconds


async def _redis_get(key: str) -> Optional[str]:
    if _redis_client is None:
        return None
    try:
        return await _redis_client.get(key)
    except Exception:
        return None


async def _redis_set(key: str, value: str, ttl: int = _PRICE_TTL) -> None:
    if _redis_client is None:
        return
    try:
        await _redis_client.set(key, value, ex=ttl)
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# Current price (with Redis cache)
# ─────────────────────────────────────────────────────────────────────────────
async def get_current_price(symbol: str) -> Optional[float]:
    """Return the latest price for symbol. Caches in Redis for 60 s."""
    cache_key = f"price:{symbol}"
    cached = await _redis_get(cache_key)
    if cached is not None:
        try:
            return float(cached)
        except ValueError:
            pass

    # Fetch from yfinance in executor to avoid blocking the event loop
    loop = asyncio.get_running_loop()
    price = await loop.run_in_executor(None, _fetch_price_sync, symbol)

    if price is not None:
        await _redis_set(cache_key, str(price))

    return price


def _fetch_price_sync(symbol: str) -> Optional[float]:
    """Synchronous yfinance call, run in a thread pool."""
    try:
        ticker = yf.Ticker(symbol)
        price = ticker.fast_info.last_price
        if price and price > 0:
            return float(price)
        # Fallback: use history
        hist = ticker.history(period="1d")
        if not hist.empty:
            return float(hist["Close"].iloc[-1])
    except Exception as exc:
        logger.warning("get_current_price(%s) failed: %s", symbol, exc)
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Price history
# ─────────────────────────────────────────────────────────────────────────────
async def get_price_history(symbols: List[str], days: int) -> Optional[pd.DataFrame]:
    """Download close-price history for a list of symbols. Caches in Redis."""
    if not symbols:
        return None

    sorted_symbols = sorted(symbols)
    cache_key = f"history:price:{','.join(sorted_symbols)}:days:{days}"
    
    cached = await _redis_get(cache_key)
    if cached is not None:
        try:
            df = pd.read_json(cached, orient='split')
            if not df.empty:
                return df
        except Exception as exc:
            logger.warning("Failed to parse cached price history: %s", exc)

    loop = asyncio.get_running_loop()
    df = await loop.run_in_executor(None, _fetch_history_sync, symbols, days)

    if df is not None and not df.empty:
        try:
            settings = get_settings()
            df_json = df.to_json(orient='split')
            await _redis_set(cache_key, df_json, ttl=settings.PRICE_HISTORY_CACHE_TTL)
        except Exception as exc:
            logger.warning("Failed to cache price history: %s", exc)

    return df


def _fetch_history_sync(symbols: List[str], days: int) -> Optional[pd.DataFrame]:
    """Synchronous yfinance download, run in a thread pool."""
    try:
        period = f"{days}d"
        raw = yf.download(
            tickers=symbols,
            period=period,
            auto_adjust=True,
            progress=False,
            threads=True,
        )

        if raw is None or raw.empty:
            return None

        # yf.download returns multi-level columns when >1 symbol
        if isinstance(raw.columns, pd.MultiIndex):
            close = raw["Close"]
        else:
            # Single symbol – columns are simple
            close = raw[["Close"]].rename(columns={"Close": symbols[0]})

        # Drop columns that are entirely NaN
        close = close.dropna(axis=1, how="all")
        # Forward-fill small gaps then drop remaining NaNs
        close = close.ffill().dropna()

        return close
    except Exception as exc:
        logger.error("get_price_history failed: %s", exc)
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Benchmark history
# ─────────────────────────────────────────────────────────────────────────────
async def get_benchmark_history(benchmark: str, days: int) -> Optional[pd.Series]:
    """Download close-price history for a benchmark ticker. Caches in Redis."""
    if not benchmark:
        return None

    cache_key = f"history:benchmark:{benchmark}:days:{days}"

    cached = await _redis_get(cache_key)
    if cached is not None:
        try:
            series = pd.read_json(cached, orient='split', typ='series')
            if not series.empty:
                return series
        except Exception as exc:
            logger.warning("Failed to parse cached benchmark history: %s", exc)

    loop = asyncio.get_running_loop()
    series = await loop.run_in_executor(None, _fetch_benchmark_sync, benchmark, days)

    if series is not None and not series.empty:
        try:
            settings = get_settings()
            series_json = series.to_json(orient='split')
            await _redis_set(cache_key, series_json, ttl=settings.PRICE_HISTORY_CACHE_TTL)
        except Exception as exc:
            logger.warning("Failed to cache benchmark history: %s", exc)

    return series


def _fetch_benchmark_sync(benchmark: str, days: int) -> Optional[pd.Series]:
    """Synchronous benchmark fetch."""
    try:
        period = f"{days}d"
        raw = yf.download(
            tickers=benchmark,
            period=period,
            auto_adjust=True,
            progress=False,
        )
        if raw is None or raw.empty:
            return None
        if isinstance(raw.columns, pd.MultiIndex):
            close = raw["Close"].squeeze()
        else:
            close = raw["Close"]
        close = close.ffill().dropna()
        return close
    except Exception as exc:
        logger.warning("get_benchmark_history(%s) failed: %s", benchmark, exc)
        return None
