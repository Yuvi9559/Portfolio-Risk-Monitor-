from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import get_settings
from app.database import get_db
from app.models import Holding, Portfolio, RiskSnapshot, User
from app.routers.portfolios import _assert_owner
from app.schemas import HoldingResponse, RiskMetrics, RiskSnapshotResponse
from app.services import price_service, risk_engine

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/risk", tags=["Risk"])


@router.get("/{portfolio_id}", response_model=RiskMetrics)
async def get_risk_metrics(
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RiskMetrics:
    """Compute full risk metrics for a portfolio, persist a snapshot and return results."""
    portfolio = await _assert_owner(portfolio_id, current_user.id, db)

    # ── Fetch holdings ────────────────────────────────────────────────────────
    result = await db.execute(
        select(Holding).where(Holding.portfolio_id == portfolio_id)
    )
    holdings = result.scalars().all()

    if not holdings:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Portfolio has no holdings – add at least one holding first.",
        )

    symbols = [h.symbol for h in holdings]
    holdings_dict = {
        h.symbol: float(h.shares) for h in holdings
    }

    # ── Fetch price history ───────────────────────────────────────────────────
    lookback = settings.LOOKBACK_DAYS
    prices_df = await price_service.get_price_history(symbols, lookback)
    benchmark_series = await price_service.get_benchmark_history(
        portfolio.benchmark, lookback
    )

    if prices_df is None or prices_df.empty:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not fetch price history for the portfolio symbols.",
        )

    # ── Compute risk ──────────────────────────────────────────────────────────
    risk_result = risk_engine.compute_portfolio_risk(
        prices_df=prices_df,
        holdings_dict=holdings_dict,
        benchmark_series=benchmark_series,
        risk_free=settings.RISK_FREE_RATE,
    )

    # ── Monte Carlo ───────────────────────────────────────────────────────────
    mc_result = risk_engine.run_monte_carlo(
        current_value=risk_result.portfolio_value,
        mean_return=risk_result.daily_return_pct / 100,
        volatility=risk_result.volatility / 100,
        days=90,
        simulations=10000,
    )

    # ── Persist snapshot ──────────────────────────────────────────────────────
    snapshot = RiskSnapshot(
        portfolio_id=portfolio_id,
        ts=datetime.now(timezone.utc),
        portfolio_value=risk_result.portfolio_value,
        daily_return=risk_result.daily_return_pct,
        var_95=risk_result.var_95,
        cvar_95=risk_result.cvar_95,
        var_99=risk_result.var_99,
        var_95_dollar=risk_result.var_95_dollar,
        sharpe=risk_result.sharpe,
        sortino=risk_result.sortino,
        beta=risk_result.beta,
        max_drawdown=risk_result.max_drawdown,
        volatility=risk_result.volatility,
    )
    db.add(snapshot)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        logger.warning(
            "RiskSnapshot duplicate PK detected for portfolio %s at %s. Ignored.",
            portfolio_id,
            snapshot.ts,
        )

    # ── Build enriched holdings list ──────────────────────────────────────────
    enriched_holdings: List[HoldingResponse] = []
    for h in holdings:
        cp = await price_service.get_current_price(h.symbol)
        shares = float(h.shares)
        avg_cost = float(h.avg_cost) if h.avg_cost else None
        mv = cp * shares if cp else None
        pnl_dollar = (cp - avg_cost) * shares if cp and avg_cost else None
        pnl_pct = (
            ((cp - avg_cost) / avg_cost * 100) if cp and avg_cost and avg_cost > 0 else None
        )
        enriched_holdings.append(
            HoldingResponse(
                id=h.id,
                symbol=h.symbol,
                asset_type=h.asset_type,
                shares=shares,
                avg_cost=avg_cost,
                current_price=cp,
                market_value=mv,
                pnl_pct=pnl_pct,
                pnl_dollar=pnl_dollar,
            )
        )

    return RiskMetrics(
        portfolio_id=str(portfolio_id),
        portfolio_value=risk_result.portfolio_value,
        daily_return_pct=risk_result.daily_return_pct,
        var_95=risk_result.var_95,
        cvar_95=risk_result.cvar_95,
        var_99=risk_result.var_99,
        var_95_dollar=risk_result.var_95_dollar,
        sharpe=risk_result.sharpe,
        sortino=risk_result.sortino,
        beta=risk_result.beta,
        max_drawdown=risk_result.max_drawdown,
        volatility=risk_result.volatility,
        correlation=risk_result.correlation,
        weights=risk_result.weights,
        monte_carlo=mc_result,
        holdings=enriched_holdings,
    )


@router.get("/{portfolio_id}/history", response_model=List[RiskSnapshotResponse])
async def get_risk_history(
    portfolio_id: uuid.UUID,
    days: int = Query(default=30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[RiskSnapshotResponse]:
    """Return historic risk snapshots for the portfolio."""
    await _assert_owner(portfolio_id, current_user.id, db)

    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(RiskSnapshot)
        .where(
            RiskSnapshot.portfolio_id == portfolio_id,
            RiskSnapshot.ts >= cutoff,
        )
        .order_by(RiskSnapshot.ts.asc())
    )
    snapshots = result.scalars().all()
    return [RiskSnapshotResponse.model_validate(s) for s in snapshots]
