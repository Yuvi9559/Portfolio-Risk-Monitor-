from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import feedparser
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

logger = logging.getLogger(__name__)

# Shared VADER analyser (thread-safe, initialise once)
_analyser = SentimentIntensityAnalyzer()

# ─────────────────────────────────────────────────────────────────────────────
# RSS feed templates
# ─────────────────────────────────────────────────────────────────────────────
def _build_feeds(clean_symbol: str) -> List[str]:
    """Return a list of RSS URLs to try for the given (cleaned) symbol."""
    return [
        f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={clean_symbol}&region=US&lang=en-US",
        f"https://news.google.com/rss/search?q={clean_symbol}+stock&hl=en-US&gl=US&ceid=US:en",
        f"https://www.marketwatch.com/rss/topstories",
    ]


def _clean_symbol(symbol: str) -> str:
    """Strip exchange suffixes (.NS, .BO, -USD, =X, ^) for search queries."""
    # Remove trailing exchange qualifiers
    cleaned = re.sub(r"\.(NS|BO|L|TO|AX|HK|SI|KS|F|DE|PA|MC|MI|AS|BR|LS|SW|VI)$", "", symbol, flags=re.IGNORECASE)
    # Remove forex suffix
    cleaned = re.sub(r"=X$", "", cleaned, flags=re.IGNORECASE)
    # Remove caret for indices (^NSEI -> NSEI)
    cleaned = cleaned.lstrip("^")
    # Remove -USD, -USDT etc for crypto
    cleaned = re.sub(r"-(USD|USDT|BTC|ETH)$", "", cleaned, flags=re.IGNORECASE)
    return cleaned.upper()


def _parse_date(entry: Any) -> Optional[datetime]:
    """Try to parse a feedparser entry's published date."""
    for attr in ("published_parsed", "updated_parsed"):
        parsed = getattr(entry, attr, None)
        if parsed:
            try:
                return datetime(*parsed[:6], tzinfo=timezone.utc)
            except Exception:
                pass
    return None


def _score_headline(headline: str) -> Dict[str, Any]:
    """Score a headline with VADER and return score + label."""
    scores = _analyser.polarity_scores(headline)
    compound = scores["compound"]
    if compound >= 0.05:
        label = "positive"
    elif compound <= -0.05:
        label = "negative"
    else:
        label = "neutral"
    return {"sentiment_score": round(compound, 3), "sentiment_label": label}


# ─────────────────────────────────────────────────────────────────────────────
# Per-symbol news fetch
# ─────────────────────────────────────────────────────────────────────────────
def _fetch_news_sync(symbol: str, max_items: int = 5) -> List[Dict[str, Any]]:
    """Synchronous: parse RSS feeds and score headlines with VADER."""
    clean = _clean_symbol(symbol)
    feeds = _build_feeds(clean)
    items: List[Dict[str, Any]] = []

    for feed_url in feeds:
        if len(items) >= max_items:
            break
        try:
            parsed = feedparser.parse(feed_url)
            for entry in parsed.entries:
                if len(items) >= max_items:
                    break
                headline: str = entry.get("title", "").strip()
                if not headline:
                    continue
                url: str = entry.get("link", "")
                pub_dt = _parse_date(entry)
                sentiment = _score_headline(headline)
                items.append(
                    {
                        "symbol": symbol,
                        "headline": headline,
                        "url": url or None,
                        "sentiment_score": sentiment["sentiment_score"],
                        "sentiment_label": sentiment["sentiment_label"],
                        "published_at": pub_dt,
                    }
                )
        except Exception as exc:
            logger.warning("RSS feed error for %s (%s): %s", symbol, feed_url, exc)

    return items


async def get_news_for_symbol(symbol: str, max_items: int = 5) -> List[Dict[str, Any]]:
    """Async wrapper around the synchronous feed parsing."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _fetch_news_sync, symbol, max_items)


# ─────────────────────────────────────────────────────────────────────────────
# Portfolio-level news aggregation
# ─────────────────────────────────────────────────────────────────────────────
async def get_portfolio_news(symbols: List[str]) -> List[Dict[str, Any]]:
    """Fetch news for all symbols concurrently, then sort by published_at descending."""
    tasks = [get_news_for_symbol(sym) for sym in symbols]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_items: List[Dict[str, Any]] = []
    for res in results:
        if isinstance(res, list):
            all_items.extend(res)
        else:
            logger.warning("News fetch task returned exception: %s", res)

    # Sort by published_at descending (None dates go to the end)
    all_items.sort(
        key=lambda x: x.get("published_at") or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return all_items
