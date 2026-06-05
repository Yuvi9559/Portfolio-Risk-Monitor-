from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import TraderDetailResponse, TraderSummary
from app.services.edgar_service import get_all_traders, get_trader_detail, get_trader_news

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/traders", tags=["Top Traders"])


@router.get("", response_model=list[TraderSummary])
async def list_traders(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all tracked top traders with summary + top 5 holdings."""
    traders = await get_all_traders(db)
    return traders


@router.get("/{trader_id}", response_model=TraderDetailResponse)
async def trader_detail(
    trader_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return full portfolio detail for a specific trader."""
    detail = await get_trader_detail(db, trader_id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trader '{trader_id}' not found",
        )
    return detail


@router.get("/{trader_id}/news")
async def trader_news(
    trader_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return latest news for a trader's top holdings."""
    news = await get_trader_news(db, trader_id)
    return news
