from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import Portfolio, Holding, RiskSnapshot, User
from app.schemas import (
    PortfolioCreate, PortfolioResponse,
    HoldingAdd, HoldingResponse, RiskMetrics
)
from app.services.price_service import load_price_history, get_cached_price
from app.services.risk_engine import compute_portfolio_risk

router = APIRouter(prefix="/portfolios", tags=["Portfolios"])


# ── Portfolio CRUD ────────────────────────────────────────────

@router.get("", response_model=list[PortfolioResponse])
async def list_portfolios(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Portfolio).where(Portfolio.user_id == current_user.id)
    )
    return result.scalars().all()


@router.post("", response_model=PortfolioResponse, status_code=201)
async def create_portfolio(
    payload: PortfolioCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    portfolio = Portfolio(
        user_id=current_user.id,
        name=payload.name,
        benchmark=payload.benchmark,
    )
    db.add(portfolio)
    await db.commit()
    await db.refresh(portfolio)
    return portfolio


@router.delete("/{portfolio_id}", status_code=204)
async def delete_portfolio(
    portfolio_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Portfolio).where(
            Portfolio.id == portfolio_id,
            Portfolio.user_id == current_user.id,
        )
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    await db.delete(p)
    await db.commit()


# ── Holdings ──────────────────────────────────────────────────

@router.get("/{portfolio_id}/holdings", response_model=list[HoldingResponse])
async def list_holdings(
    portfolio_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _assert_owner(portfolio_id, current_user.id, db)
    result = await db.execute(
        select(Holding).where(Holding.portfolio_id == portfolio_id)
    )
    holdings = result.scalars().all()

    out = []
    for h in holdings:
        price = await get_cached_price(h.ticker)
        market_value = float(h.shares) * price if price else None
        pnl = ((price - float(h.avg_cost)) / float(h.avg_cost) * 100) if price and h.avg_cost else None
        out.append(HoldingResponse(
            id=h.id,
            ticker=h.ticker,
            shares=float(h.shares),
            avg_cost=float(h.avg_cost) if h.avg_cost else None,
            current_price=price,
            market_value=market_value,
            pnl_pct=round(pnl, 2) if pnl else None,
        ))
    return out


@router.post("/{portfolio_id}/holdings", response_model=HoldingResponse, status_code=201)
async def add_holding(
    portfolio_id: UUID,
    payload: HoldingAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _assert_owner(portfolio_id, current_user.id, db)

    existing = await db.execute(
        select(Holding).where(
            Holding.portfolio_id == portfolio_id,
            Holding.ticker == payload.ticker,
        )
    )
    h = existing.scalar_one_or_none()
    if h:
        h.shares = payload.shares
        h.avg_cost = payload.avg_cost
    else:
        h = Holding(
            portfolio_id=portfolio_id,
            ticker=payload.ticker,
            shares=payload.shares,
            avg_cost=payload.avg_cost,
        )
        db.add(h)

    await db.commit()
    await db.refresh(h)
    return HoldingResponse(id=h.id, ticker=h.ticker, shares=float(h.shares), avg_cost=float(h.avg_cost) if h.avg_cost else None)


@router.delete("/{portfolio_id}/holdings/{ticker}", status_code=204)
async def remove_holding(
    portfolio_id: UUID,
    ticker: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _assert_owner(portfolio_id, current_user.id, db)
    await db.execute(
        delete(Holding).where(
            Holding.portfolio_id == portfolio_id,
            Holding.ticker == ticker.upper(),
        )
    )
    await db.commit()


# ── Risk Snapshot (REST fallback) ─────────────────────────────

@router.get("/{portfolio_id}/risk", response_model=RiskMetrics)
async def get_risk(
    portfolio_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    portfolio = await _assert_owner(portfolio_id, current_user.id, db)
    return await _compute_risk_payload(portfolio, db)


# ── Risk History ──────────────────────────────────────────────

@router.get("/{portfolio_id}/risk/history")
async def risk_history(
    portfolio_id: UUID,
    days: int = 30,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _assert_owner(portfolio_id, current_user.id, db)
    from sqlalchemy import text
    rows = await db.execute(
        text("""
            SELECT ts, portfolio_value, var_95, sharpe, sortino, beta, max_drawdown
            FROM risk_snapshots
            WHERE portfolio_id = :pid
            ORDER BY ts DESC
            LIMIT :lim
        """),
        {"pid": str(portfolio_id), "lim": days},
    )
    return [dict(r._mapping) for r in rows.fetchall()]


# ── Helpers ───────────────────────────────────────────────────

async def _assert_owner(portfolio_id: UUID, user_id, db: AsyncSession) -> Portfolio:
    result = await db.execute(
        select(Portfolio).where(
            Portfolio.id == portfolio_id,
            Portfolio.user_id == user_id,
        )
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return p


async def _compute_risk_payload(portfolio: Portfolio, db: AsyncSession) -> RiskMetrics:
    result = await db.execute(
        select(Holding).where(Holding.portfolio_id == portfolio.id)
    )
    holdings = result.scalars().all()
    if not holdings:
        raise HTTPException(status_code=400, detail="Portfolio has no holdings")

    tickers = [h.ticker for h in holdings]
    prices_df = await load_price_history(tickers, db)

    holdings_dict = {h.ticker: float(h.shares) for h in holdings}
    risk = compute_portfolio_risk(prices_df, holdings_dict, benchmark=portfolio.benchmark)

    # Persist snapshot
    snap = RiskSnapshot(
        portfolio_id=portfolio.id,
        ts=datetime.now(timezone.utc),
        portfolio_value=risk.portfolio_value,
        daily_return=risk.daily_return_pct / 100,
        var_95=risk.var_95,
        cvar_95=risk.cvar_95,
        var_99=risk.var_99,
        sharpe=risk.sharpe,
        sortino=risk.sortino,
        beta=risk.beta,
        max_drawdown=risk.max_drawdown,
    )
    db.add(snap)
    await db.commit()

    # Build holdings response
    holding_responses = []
    for h in holdings:
        price = await get_cached_price(h.ticker) or float(prices_df[h.ticker].iloc[-1]) if h.ticker in prices_df else None
        mv = float(h.shares) * price if price else None
        pnl = ((price - float(h.avg_cost)) / float(h.avg_cost) * 100) if price and h.avg_cost else None
        holding_responses.append(HoldingResponse(
            id=h.id, ticker=h.ticker, shares=float(h.shares),
            avg_cost=float(h.avg_cost) if h.avg_cost else None,
            current_price=price, market_value=mv, pnl_pct=round(pnl, 2) if pnl else None,
        ))

    return RiskMetrics(
        portfolio_id=str(portfolio.id),
        computed_at=datetime.now(timezone.utc),
        portfolio_value=risk.portfolio_value,
        daily_return_pct=risk.daily_return_pct,
        var_95=risk.var_95, cvar_95=risk.cvar_95, var_99=risk.var_99,
        var_95_dollar=risk.var_95_dollar,
        sharpe=risk.sharpe, sortino=risk.sortino,
        beta=risk.beta, max_drawdown=risk.max_drawdown,
        holdings=holding_responses,
        correlation=risk.correlation,
        weights=risk.weights,
    )
