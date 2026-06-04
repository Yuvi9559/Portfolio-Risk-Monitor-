from __future__ import annotations

import logging
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Holding, User
from app.routers.portfolios import _assert_owner
from app.schemas import NewsItem
from app.services import news_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/news", tags=["News"])


@router.get("/{portfolio_id}", response_model=List[NewsItem])
async def get_portfolio_news(
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[NewsItem]:
    """Fetch recent sentiment-scored news for all holdings in a portfolio."""
    await _assert_owner(portfolio_id, current_user.id, db)

    result = await db.execute(
        select(Holding.symbol).where(Holding.portfolio_id == portfolio_id)
    )
    symbols: List[str] = [row[0] for row in result.fetchall()]

    if not symbols:
        return []

    raw_news = await news_service.get_portfolio_news(symbols)

    news_items: List[NewsItem] = []
    for item in raw_news:
        news_items.append(
            NewsItem(
                symbol=item.get("symbol", ""),
                headline=item.get("headline", ""),
                url=item.get("url"),
                sentiment_score=float(item.get("sentiment_score", 0.0)),
                sentiment_label=item.get("sentiment_label", "neutral"),
                published_at=item.get("published_at"),
            )
        )

    return news_items
