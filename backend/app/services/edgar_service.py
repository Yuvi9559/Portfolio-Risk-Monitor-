from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import feedparser
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Trader, TraderHolding

logger = logging.getLogger(__name__)

_vader = SentimentIntensityAnalyzer()

# ─────────────────────────────────────────────────────────────────────────────
# Pre-seeded 13F data (based on latest public filings)
# ─────────────────────────────────────────────────────────────────────────────
TRADERS_DATA: dict[str, dict[str, Any]] = {
    "warren-buffett": {
        "name": "Warren Buffett",
        "firm": "Berkshire Hathaway",
        "strategy": "Value Investing",
        "bio": "The Oracle of Omaha. CEO of Berkshire Hathaway, legendary value investor with a 60+ year track record.",
        "cik": "0001067983",
        "portfolio_value": 267_000_000_000,
        "quarter": "Q1 2026",
        "holdings": [
            {"symbol": "AAPL", "company_name": "Apple Inc", "shares": 300_000_000, "value": 69_000_000_000, "pct_portfolio": 25.8, "change_type": "SELL", "change_shares": -100_000_000, "change_pct": -25.0, "sector": "Technology"},
            {"symbol": "AXP", "company_name": "American Express", "shares": 152_000_000, "value": 41_000_000_000, "pct_portfolio": 15.4, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Financial"},
            {"symbol": "BAC", "company_name": "Bank of America", "shares": 680_000_000, "value": 30_000_000_000, "pct_portfolio": 11.2, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Financial"},
            {"symbol": "KO", "company_name": "Coca-Cola Co", "shares": 400_000_000, "value": 28_000_000_000, "pct_portfolio": 10.5, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Consumer Staples"},
            {"symbol": "CVX", "company_name": "Chevron Corp", "shares": 120_000_000, "value": 19_000_000_000, "pct_portfolio": 7.1, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Energy"},
            {"symbol": "OXY", "company_name": "Occidental Petroleum", "shares": 255_000_000, "value": 15_000_000_000, "pct_portfolio": 5.6, "change_type": "BUY", "change_shares": 10_000_000, "change_pct": 4.1, "sector": "Energy"},
            {"symbol": "MCO", "company_name": "Moody's Corp", "shares": 24_700_000, "value": 11_000_000_000, "pct_portfolio": 4.1, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Financial"},
            {"symbol": "KHC", "company_name": "Kraft Heinz", "shares": 326_000_000, "value": 10_000_000_000, "pct_portfolio": 3.7, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Consumer Staples"},
        ],
    },
    "ray-dalio": {
        "name": "Ray Dalio",
        "firm": "Bridgewater Associates",
        "strategy": "Global Macro",
        "bio": "Founder of world's largest hedge fund. Pioneer of risk parity and all-weather portfolio strategies.",
        "cik": "0001350694",
        "portfolio_value": 16_500_000_000,
        "quarter": "Q1 2026",
        "holdings": [
            {"symbol": "SPY", "company_name": "SPDR S&P 500 ETF", "shares": 5_000_000, "value": 2_800_000_000, "pct_portfolio": 17.0, "change_type": "BUY", "change_shares": 500_000, "change_pct": 11.1, "sector": "ETF"},
            {"symbol": "VWO", "company_name": "Vanguard Emerging Mkts", "shares": 30_000_000, "value": 1_200_000_000, "pct_portfolio": 7.3, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "ETF"},
            {"symbol": "IEMG", "company_name": "iShares Core MSCI EM", "shares": 22_000_000, "value": 1_100_000_000, "pct_portfolio": 6.7, "change_type": "BUY", "change_shares": 2_000_000, "change_pct": 10.0, "sector": "ETF"},
            {"symbol": "GLD", "company_name": "SPDR Gold Shares", "shares": 4_300_000, "value": 970_000_000, "pct_portfolio": 5.9, "change_type": "BUY", "change_shares": 800_000, "change_pct": 22.9, "sector": "Commodity"},
            {"symbol": "GOOG", "company_name": "Alphabet Inc", "shares": 4_500_000, "value": 800_000_000, "pct_portfolio": 4.8, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Technology"},
            {"symbol": "NVDA", "company_name": "NVIDIA Corp", "shares": 5_200_000, "value": 780_000_000, "pct_portfolio": 4.7, "change_type": "BUY", "change_shares": 1_200_000, "change_pct": 30.0, "sector": "Technology"},
            {"symbol": "PG", "company_name": "Procter & Gamble", "shares": 4_200_000, "value": 740_000_000, "pct_portfolio": 4.5, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Consumer Staples"},
            {"symbol": "JNJ", "company_name": "Johnson & Johnson", "shares": 4_000_000, "value": 640_000_000, "pct_portfolio": 3.9, "change_type": "SELL", "change_shares": -500_000, "change_pct": -11.1, "sector": "Healthcare"},
        ],
    },
    "michael-burry": {
        "name": "Michael Burry",
        "firm": "Scion Asset Management",
        "strategy": "Contrarian Value",
        "bio": "The Big Short. Famous for predicting the 2008 housing crisis. Known for concentrated, contrarian bets.",
        "cik": "0001649339",
        "portfolio_value": 89_000_000,
        "quarter": "Q1 2026",
        "holdings": [
            {"symbol": "BABA", "company_name": "Alibaba Group", "shares": 200_000, "value": 22_000_000, "pct_portfolio": 24.7, "change_type": "NEW", "change_shares": 200_000, "change_pct": 100.0, "sector": "Technology"},
            {"symbol": "JD", "company_name": "JD.com Inc", "shares": 500_000, "value": 18_000_000, "pct_portfolio": 20.2, "change_type": "BUY", "change_shares": 100_000, "change_pct": 25.0, "sector": "Consumer Discretionary"},
            {"symbol": "GOOG", "company_name": "Alphabet Inc", "shares": 75_000, "value": 13_000_000, "pct_portfolio": 14.6, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Technology"},
            {"symbol": "HCA", "company_name": "HCA Healthcare", "shares": 30_000, "value": 10_000_000, "pct_portfolio": 11.2, "change_type": "NEW", "change_shares": 30_000, "change_pct": 100.0, "sector": "Healthcare"},
            {"symbol": "SIRI", "company_name": "Sirius XM", "shares": 4_000_000, "value": 10_000_000, "pct_portfolio": 11.2, "change_type": "SELL", "change_shares": -1_000_000, "change_pct": -20.0, "sector": "Communication"},
            {"symbol": "REAL", "company_name": "RealReal Inc", "shares": 2_000_000, "value": 8_000_000, "pct_portfolio": 9.0, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Consumer Discretionary"},
        ],
    },
    "cathie-wood": {
        "name": "Cathie Wood",
        "firm": "ARK Invest",
        "strategy": "Disruptive Innovation",
        "bio": "CEO of ARK Invest. Focuses on disruptive innovation across genomics, AI, fintech, and autonomous tech.",
        "cik": "0001853470",
        "portfolio_value": 6_700_000_000,
        "quarter": "Q1 2026",
        "holdings": [
            {"symbol": "TSLA", "company_name": "Tesla Inc", "shares": 4_500_000, "value": 1_300_000_000, "pct_portfolio": 19.4, "change_type": "SELL", "change_shares": -300_000, "change_pct": -6.3, "sector": "Consumer Discretionary"},
            {"symbol": "COIN", "company_name": "Coinbase Global", "shares": 4_000_000, "value": 900_000_000, "pct_portfolio": 13.4, "change_type": "BUY", "change_shares": 500_000, "change_pct": 14.3, "sector": "Financial"},
            {"symbol": "ROKU", "company_name": "Roku Inc", "shares": 7_000_000, "value": 560_000_000, "pct_portfolio": 8.4, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Technology"},
            {"symbol": "RBLX", "company_name": "Roblox Corp", "shares": 8_000_000, "value": 480_000_000, "pct_portfolio": 7.2, "change_type": "BUY", "change_shares": 1_500_000, "change_pct": 23.1, "sector": "Technology"},
            {"symbol": "PATH", "company_name": "UiPath Inc", "shares": 25_000_000, "value": 400_000_000, "pct_portfolio": 6.0, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Technology"},
            {"symbol": "CRSP", "company_name": "CRISPR Therapeutics", "shares": 5_000_000, "value": 350_000_000, "pct_portfolio": 5.2, "change_type": "BUY", "change_shares": 800_000, "change_pct": 19.0, "sector": "Healthcare"},
            {"symbol": "SQ", "company_name": "Block Inc", "shares": 4_500_000, "value": 330_000_000, "pct_portfolio": 4.9, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Financial"},
        ],
    },
    "bill-ackman": {
        "name": "Bill Ackman",
        "firm": "Pershing Square Capital",
        "strategy": "Activist Investing",
        "bio": "Billionaire activist investor. Known for large concentrated positions and corporate activism campaigns.",
        "cik": "0001336528",
        "portfolio_value": 10_400_000_000,
        "quarter": "Q1 2026",
        "holdings": [
            {"symbol": "UNH", "company_name": "UnitedHealth Group", "shares": 3_600_000, "value": 1_800_000_000, "pct_portfolio": 17.3, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Healthcare"},
            {"symbol": "HLT", "company_name": "Hilton Worldwide", "shares": 6_600_000, "value": 1_600_000_000, "pct_portfolio": 15.4, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Consumer Discretionary"},
            {"symbol": "QSR", "company_name": "Restaurant Brands Intl", "shares": 22_000_000, "value": 1_500_000_000, "pct_portfolio": 14.4, "change_type": "BUY", "change_shares": 2_000_000, "change_pct": 10.0, "sector": "Consumer Discretionary"},
            {"symbol": "GOOGL", "company_name": "Alphabet Inc Class A", "shares": 7_600_000, "value": 1_350_000_000, "pct_portfolio": 13.0, "change_type": "NEW", "change_shares": 7_600_000, "change_pct": 100.0, "sector": "Technology"},
            {"symbol": "CP", "company_name": "Canadian Pacific Kansas City", "shares": 16_800_000, "value": 1_350_000_000, "pct_portfolio": 13.0, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Industrials"},
            {"symbol": "CMG", "company_name": "Chipotle Mexican Grill", "shares": 18_900_000, "value": 1_100_000_000, "pct_portfolio": 10.6, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Consumer Discretionary"},
        ],
    },
    "george-soros": {
        "name": "George Soros",
        "firm": "Soros Fund Management",
        "strategy": "Global Macro",
        "bio": "The Man Who Broke the Bank of England. Legendary macro trader known for massive currency and index trades.",
        "cik": "0001029160",
        "portfolio_value": 5_400_000_000,
        "quarter": "Q1 2026",
        "holdings": [
            {"symbol": "LLY", "company_name": "Eli Lilly & Co", "shares": 800_000, "value": 640_000_000, "pct_portfolio": 11.9, "change_type": "BUY", "change_shares": 200_000, "change_pct": 33.3, "sector": "Healthcare"},
            {"symbol": "MSFT", "company_name": "Microsoft Corp", "shares": 1_300_000, "value": 560_000_000, "pct_portfolio": 10.4, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Technology"},
            {"symbol": "AMZN", "company_name": "Amazon.com Inc", "shares": 2_500_000, "value": 500_000_000, "pct_portfolio": 9.3, "change_type": "BUY", "change_shares": 500_000, "change_pct": 25.0, "sector": "Technology"},
            {"symbol": "NVO", "company_name": "Novo Nordisk", "shares": 3_000_000, "value": 420_000_000, "pct_portfolio": 7.8, "change_type": "NEW", "change_shares": 3_000_000, "change_pct": 100.0, "sector": "Healthcare"},
            {"symbol": "CRM", "company_name": "Salesforce Inc", "shares": 1_200_000, "value": 350_000_000, "pct_portfolio": 6.5, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Technology"},
            {"symbol": "UBER", "company_name": "Uber Technologies", "shares": 4_000_000, "value": 310_000_000, "pct_portfolio": 5.7, "change_type": "SELL", "change_shares": -1_000_000, "change_pct": -20.0, "sector": "Technology"},
        ],
    },
    "david-tepper": {
        "name": "David Tepper",
        "firm": "Appaloosa Management",
        "strategy": "Event-Driven",
        "bio": "Billionaire hedge fund manager. Specializes in distressed debt and event-driven situations.",
        "cik": "0001047644",
        "portfolio_value": 6_900_000_000,
        "quarter": "Q1 2026",
        "holdings": [
            {"symbol": "NVDA", "company_name": "NVIDIA Corp", "shares": 3_500_000, "value": 525_000_000, "pct_portfolio": 7.6, "change_type": "SELL", "change_shares": -1_000_000, "change_pct": -22.2, "sector": "Technology"},
            {"symbol": "META", "company_name": "Meta Platforms", "shares": 900_000, "value": 480_000_000, "pct_portfolio": 7.0, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Technology"},
            {"symbol": "MSFT", "company_name": "Microsoft Corp", "shares": 1_000_000, "value": 430_000_000, "pct_portfolio": 6.2, "change_type": "BUY", "change_shares": 200_000, "change_pct": 25.0, "sector": "Technology"},
            {"symbol": "AMZN", "company_name": "Amazon.com Inc", "shares": 2_000_000, "value": 400_000_000, "pct_portfolio": 5.8, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Technology"},
            {"symbol": "BABA", "company_name": "Alibaba Group", "shares": 3_000_000, "value": 330_000_000, "pct_portfolio": 4.8, "change_type": "BUY", "change_shares": 1_000_000, "change_pct": 50.0, "sector": "Technology"},
            {"symbol": "GOOG", "company_name": "Alphabet Inc", "shares": 1_800_000, "value": 320_000_000, "pct_portfolio": 4.6, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Technology"},
            {"symbol": "QQQ", "company_name": "Invesco QQQ Trust", "shares": 600_000, "value": 300_000_000, "pct_portfolio": 4.3, "change_type": "BUY", "change_shares": 200_000, "change_pct": 50.0, "sector": "ETF"},
        ],
    },
    "seth-klarman": {
        "name": "Seth Klarman",
        "firm": "Baupost Group",
        "strategy": "Deep Value",
        "bio": "Author of Margin of Safety. Runs one of the largest hedge funds. Known for patient, deep value investing.",
        "cik": "0001061768",
        "portfolio_value": 6_200_000_000,
        "quarter": "Q1 2026",
        "holdings": [
            {"symbol": "LBTYA", "company_name": "Liberty Global", "shares": 40_000_000, "value": 800_000_000, "pct_portfolio": 12.9, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Communication"},
            {"symbol": "INTC", "company_name": "Intel Corp", "shares": 20_000_000, "value": 600_000_000, "pct_portfolio": 9.7, "change_type": "BUY", "change_shares": 5_000_000, "change_pct": 33.3, "sector": "Technology"},
            {"symbol": "QRVO", "company_name": "Qorvo Inc", "shares": 5_000_000, "value": 500_000_000, "pct_portfolio": 8.1, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Technology"},
            {"symbol": "ELAN", "company_name": "Elanco Animal Health", "shares": 25_000_000, "value": 400_000_000, "pct_portfolio": 6.5, "change_type": "NEW", "change_shares": 25_000_000, "change_pct": 100.0, "sector": "Healthcare"},
            {"symbol": "VRT", "company_name": "Vertiv Holdings", "shares": 3_000_000, "value": 350_000_000, "pct_portfolio": 5.6, "change_type": "SELL", "change_shares": -500_000, "change_pct": -14.3, "sector": "Industrials"},
            {"symbol": "FOXA", "company_name": "Fox Corp", "shares": 8_000_000, "value": 320_000_000, "pct_portfolio": 5.2, "change_type": "HOLD", "change_shares": 0, "change_pct": 0, "sector": "Communication"},
        ],
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# Database seeding
# ─────────────────────────────────────────────────────────────────────────────
async def seed_traders(db: AsyncSession) -> None:
    """Insert or update pre-seeded trader data into the database."""
    try:
        for trader_id, data in TRADERS_DATA.items():
            # Check if trader already exists
            result = await db.execute(select(Trader).where(Trader.id == trader_id))
            existing = result.scalar_one_or_none()

            if existing is None:
                trader = Trader(
                    id=trader_id,
                    name=data["name"],
                    firm=data["firm"],
                    strategy=data["strategy"],
                    bio=data["bio"],
                    cik=data["cik"],
                    portfolio_value=data["portfolio_value"],
                    quarter=data["quarter"],
                )
                db.add(trader)
                await db.flush()

                for h in data["holdings"]:
                    holding = TraderHolding(
                        trader_id=trader_id,
                        symbol=h["symbol"],
                        company_name=h["company_name"],
                        shares=h["shares"],
                        value=h["value"],
                        pct_portfolio=h["pct_portfolio"],
                        change_type=h["change_type"],
                        change_shares=h["change_shares"],
                        change_pct=h["change_pct"],
                        quarter=data["quarter"],
                        sector=h["sector"],
                    )
                    db.add(holding)

                logger.info("Seeded trader: %s", data["name"])

        await db.commit()
        logger.info("Trader seeding complete.")
    except Exception as exc:
        logger.error("Failed to seed traders: %s", exc)
        await db.rollback()


# ─────────────────────────────────────────────────────────────────────────────
# Data access
# ─────────────────────────────────────────────────────────────────────────────
async def get_all_traders(db: AsyncSession) -> list[dict[str, Any]]:
    """Return all traders with their top 5 holdings."""
    result = await db.execute(select(Trader))
    traders = result.scalars().all()

    out = []
    for t in traders:
        # Eagerly load holdings
        h_result = await db.execute(
            select(TraderHolding)
            .where(TraderHolding.trader_id == t.id)
            .order_by(TraderHolding.pct_portfolio.desc())
        )
        all_holdings = h_result.scalars().all()

        buys = sum(1 for h in all_holdings if h.change_type in ("BUY", "NEW"))
        sells = sum(1 for h in all_holdings if h.change_type in ("SELL", "EXIT"))

        out.append({
            "id": t.id,
            "name": t.name,
            "firm": t.firm,
            "strategy": t.strategy,
            "bio": t.bio,
            "avatar_url": t.avatar_url,
            "portfolio_value": float(t.portfolio_value) if t.portfolio_value else None,
            "quarter": t.quarter,
            "top_holdings": [
                {
                    "symbol": h.symbol,
                    "company_name": h.company_name,
                    "shares": float(h.shares),
                    "value": float(h.value),
                    "pct_portfolio": float(h.pct_portfolio),
                    "change_type": h.change_type,
                    "change_shares": float(h.change_shares),
                    "change_pct": float(h.change_pct),
                    "sector": h.sector,
                }
                for h in all_holdings[:5]
            ],
            "total_holdings": len(all_holdings),
        })

    # Sort by portfolio value descending
    out.sort(key=lambda x: x.get("portfolio_value") or 0, reverse=True)
    return out


async def get_trader_detail(db: AsyncSession, trader_id: str) -> dict[str, Any] | None:
    """Return full trader detail with all holdings, buys, sells, and sector allocation."""
    result = await db.execute(select(Trader).where(Trader.id == trader_id))
    trader = result.scalar_one_or_none()
    if trader is None:
        return None

    h_result = await db.execute(
        select(TraderHolding)
        .where(TraderHolding.trader_id == trader_id)
        .order_by(TraderHolding.pct_portfolio.desc())
    )
    holdings = h_result.scalars().all()

    def _holding_dict(h: TraderHolding) -> dict:
        return {
            "symbol": h.symbol,
            "company_name": h.company_name,
            "shares": float(h.shares),
            "value": float(h.value),
            "pct_portfolio": float(h.pct_portfolio),
            "change_type": h.change_type,
            "change_shares": float(h.change_shares),
            "change_pct": float(h.change_pct),
            "sector": h.sector,
        }

    all_holdings = [_holding_dict(h) for h in holdings]
    recent_buys = [_holding_dict(h) for h in holdings if h.change_type in ("BUY", "NEW")]
    recent_sells = [_holding_dict(h) for h in holdings if h.change_type in ("SELL", "EXIT")]

    # Sector allocation
    sector_totals: dict[str, float] = defaultdict(float)
    for h in holdings:
        sector_totals[h.sector] += float(h.pct_portfolio)
    sector_allocation = dict(sorted(sector_totals.items(), key=lambda x: x[1], reverse=True))

    return {
        "trader": {
            "id": trader.id,
            "name": trader.name,
            "firm": trader.firm,
            "strategy": trader.strategy,
            "bio": trader.bio,
            "avatar_url": trader.avatar_url,
            "portfolio_value": float(trader.portfolio_value) if trader.portfolio_value else None,
            "quarter": trader.quarter,
            "top_holdings": all_holdings[:5],
            "total_holdings": len(all_holdings),
        },
        "holdings": all_holdings,
        "recent_buys": recent_buys,
        "recent_sells": recent_sells,
        "sector_allocation": sector_allocation,
    }


# ─────────────────────────────────────────────────────────────────────────────
# News for a trader's holdings (RSS + VADER)
# ─────────────────────────────────────────────────────────────────────────────
def _fetch_news_for_symbol(symbol: str, max_items: int = 3) -> list[dict]:
    """Blocking: fetch Google News RSS for a stock symbol and score sentiment."""
    url = f"https://news.google.com/rss/search?q={symbol}+stock&hl=en-US&gl=US&ceid=US:en"
    try:
        feed = feedparser.parse(url)
    except Exception:
        return []

    items = []
    for entry in feed.entries[:max_items]:
        headline = entry.get("title", "")
        scores = _vader.polarity_scores(headline)
        compound = scores["compound"]
        if compound >= 0.05:
            label = "positive"
        elif compound <= -0.05:
            label = "negative"
        else:
            label = "neutral"

        pub = entry.get("published", "")

        items.append({
            "symbol": symbol,
            "headline": headline,
            "url": entry.get("link", ""),
            "source": entry.get("source", {}).get("title", "Google News") if isinstance(entry.get("source"), dict) else "Google News",
            "sentiment_score": round(compound, 3),
            "sentiment_label": label,
            "published_at": pub,
        })

    return items


async def get_trader_news(db: AsyncSession, trader_id: str) -> list[dict]:
    """Fetch recent news for a trader's top 5 holdings."""
    h_result = await db.execute(
        select(TraderHolding)
        .where(TraderHolding.trader_id == trader_id)
        .order_by(TraderHolding.pct_portfolio.desc())
        .limit(5)
    )
    holdings = h_result.scalars().all()
    symbols = [h.symbol for h in holdings]

    all_news = []
    for sym in symbols:
        news = await asyncio.to_thread(_fetch_news_for_symbol, sym, 3)
        all_news.extend(news)

    return all_news
