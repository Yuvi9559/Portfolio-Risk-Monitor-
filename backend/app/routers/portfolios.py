from __future__ import annotations

import logging
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Holding, Portfolio, User
from app.schemas import HoldingAdd, HoldingResponse, PortfolioCreate, PortfolioResponse
from app.services import price_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portfolios", tags=["Portfolios"])


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────
async def _assert_owner(
    portfolio_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> Portfolio:
    """Return the Portfolio if it belongs to user_id, else raise 404/403."""
    result = await db.execute(
        select(Portfolio).where(Portfolio.id == portfolio_id)
    )
    portfolio: Portfolio | None = result.scalar_one_or_none()
    if portfolio is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portfolio not found")
    if portfolio.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your portfolio")
    return portfolio


# ─────────────────────────────────────────────────────────────────────────────
# Portfolio CRUD
# ─────────────────────────────────────────────────────────────────────────────
@router.get("", response_model=List[PortfolioResponse])
async def list_portfolios(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[PortfolioResponse]:
    result = await db.execute(
        select(Portfolio).where(Portfolio.user_id == current_user.id)
    )
    portfolios = result.scalars().all()
    return [PortfolioResponse.model_validate(p) for p in portfolios]


@router.post("", response_model=PortfolioResponse, status_code=status.HTTP_201_CREATED)
async def create_portfolio(
    body: PortfolioCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PortfolioResponse:
    portfolio = Portfolio(
        user_id=current_user.id,
        name=body.name,
        benchmark=body.benchmark,
        currency=body.currency,
    )
    db.add(portfolio)
    await db.commit()
    await db.refresh(portfolio)
    logger.info("Portfolio '%s' created for user %s", portfolio.name, current_user.email)
    return PortfolioResponse.model_validate(portfolio)


@router.delete("/{portfolio_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_portfolio(
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    portfolio = await _assert_owner(portfolio_id, current_user.id, db)
    await db.delete(portfolio)
    await db.commit()
    logger.info("Portfolio %s deleted by user %s", portfolio_id, current_user.email)


# ─────────────────────────────────────────────────────────────────────────────
# Holdings
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/{portfolio_id}/holdings", response_model=List[HoldingResponse])
async def list_holdings(
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[HoldingResponse]:
    await _assert_owner(portfolio_id, current_user.id, db)

    result = await db.execute(
        select(Holding).where(Holding.portfolio_id == portfolio_id)
    )
    holdings = result.scalars().all()

    response: List[HoldingResponse] = []
    for h in holdings:
        current_price = await price_service.get_current_price(h.symbol)
        shares = float(h.shares) if h.shares is not None else 0.0
        avg_cost = float(h.avg_cost) if h.avg_cost is not None else None

        market_value: float | None = None
        pnl_pct: float | None = None
        pnl_dollar: float | None = None

        if current_price is not None:
            market_value = current_price * shares
            if avg_cost and avg_cost > 0:
                pnl_dollar = (current_price - avg_cost) * shares
                pnl_pct = ((current_price - avg_cost) / avg_cost) * 100

        response.append(
            HoldingResponse(
                id=h.id,
                symbol=h.symbol,
                asset_type=h.asset_type,
                shares=shares,
                avg_cost=avg_cost,
                current_price=current_price,
                market_value=market_value,
                pnl_pct=pnl_pct,
                pnl_dollar=pnl_dollar,
            )
        )
    return response


@router.post(
    "/{portfolio_id}/holdings",
    response_model=HoldingResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_or_update_holding(
    portfolio_id: uuid.UUID,
    body: HoldingAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HoldingResponse:
    await _assert_owner(portfolio_id, current_user.id, db)

    # Upsert: if symbol already exists update shares & avg_cost
    result = await db.execute(
        select(Holding).where(
            Holding.portfolio_id == portfolio_id,
            Holding.symbol == body.symbol,
        )
    )
    holding: Holding | None = result.scalar_one_or_none()

    if holding is None:
        holding = Holding(
            portfolio_id=portfolio_id,
            symbol=body.symbol,
            asset_type=body.asset_type,
            shares=body.shares,
            avg_cost=body.avg_cost,
        )
        db.add(holding)
    else:
        holding.shares = body.shares
        holding.avg_cost = body.avg_cost if body.avg_cost is not None else holding.avg_cost
        holding.asset_type = body.asset_type

    await db.commit()
    await db.refresh(holding)

    current_price = await price_service.get_current_price(holding.symbol)
    shares = float(holding.shares)
    avg_cost = float(holding.avg_cost) if holding.avg_cost else None
    market_value = current_price * shares if current_price else None
    pnl_dollar = (
        (current_price - avg_cost) * shares if current_price and avg_cost else None
    )
    pnl_pct = (
        ((current_price - avg_cost) / avg_cost * 100)
        if current_price and avg_cost and avg_cost > 0
        else None
    )

    return HoldingResponse(
        id=holding.id,
        symbol=holding.symbol,
        asset_type=holding.asset_type,
        shares=shares,
        avg_cost=avg_cost,
        current_price=current_price,
        market_value=market_value,
        pnl_pct=pnl_pct,
        pnl_dollar=pnl_dollar,
    )


@router.delete(
    "/{portfolio_id}/holdings/{symbol}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def remove_holding(
    portfolio_id: uuid.UUID,
    symbol: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _assert_owner(portfolio_id, current_user.id, db)

    result = await db.execute(
        select(Holding).where(
            Holding.portfolio_id == portfolio_id,
            Holding.symbol == symbol.upper(),
        )
    )
    holding: Holding | None = result.scalar_one_or_none()
    if holding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holding not found")

    await db.delete(holding)
    await db.commit()
    logger.info("Holding %s removed from portfolio %s", symbol, portfolio_id)
