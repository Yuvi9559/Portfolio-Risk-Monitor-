from __future__ import annotations

import logging
import uuid
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Holding, Portfolio, RiskSnapshot, User
from app.routers.portfolios import _assert_owner
from app.schemas import HoldingResponse
from app.services import export_service, price_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/export", tags=["Export"])


async def _build_context(
    portfolio_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
) -> tuple[Portfolio, list[dict], dict, list[dict]]:
    """Shared helper to fetch portfolio data for export routes."""
    portfolio = await _assert_owner(portfolio_id, current_user.id, db)

    # Holdings
    result = await db.execute(
        select(Holding).where(Holding.portfolio_id == portfolio_id)
    )
    holdings_orm = result.scalars().all()

    holdings_data: list[dict] = []
    for h in holdings_orm:
        cp = await price_service.get_current_price(h.symbol)
        shares = float(h.shares)
        avg_cost = float(h.avg_cost) if h.avg_cost else None
        mv = cp * shares if cp else None
        pnl_dollar = (cp - avg_cost) * shares if cp and avg_cost else None
        pnl_pct = (
            ((cp - avg_cost) / avg_cost * 100)
            if cp and avg_cost and avg_cost > 0
            else None
        )
        holdings_data.append(
            {
                "symbol": h.symbol,
                "asset_type": h.asset_type,
                "shares": shares,
                "avg_cost": avg_cost,
                "current_price": cp,
                "market_value": mv,
                "pnl_dollar": pnl_dollar,
                "pnl_pct": pnl_pct,
            }
        )

    # Latest risk snapshot
    snap_result = await db.execute(
        select(RiskSnapshot)
        .where(RiskSnapshot.portfolio_id == portfolio_id)
        .order_by(RiskSnapshot.ts.desc())
        .limit(1)
    )
    snap = snap_result.scalar_one_or_none()
    risk_data: dict = {}
    if snap:
        risk_data = {
            "portfolio_value": float(snap.portfolio_value or 0),
            "daily_return": float(snap.daily_return or 0),
            "var_95": float(snap.var_95 or 0),
            "cvar_95": float(snap.cvar_95 or 0),
            "var_99": float(snap.var_99 or 0),
            "var_95_dollar": float(snap.var_95_dollar or 0),
            "sharpe": float(snap.sharpe or 0),
            "sortino": float(snap.sortino or 0),
            "beta": float(snap.beta or 0),
            "max_drawdown": float(snap.max_drawdown or 0),
            "volatility": float(snap.volatility or 0),
            "ts": snap.ts.isoformat(),
        }

    # Risk history (last 30 snapshots)
    hist_result = await db.execute(
        select(RiskSnapshot)
        .where(RiskSnapshot.portfolio_id == portfolio_id)
        .order_by(RiskSnapshot.ts.desc())
        .limit(30)
    )
    history_data: list[dict] = []
    for s in hist_result.scalars().all():
        history_data.append(
            {
                "ts": s.ts.isoformat(),
                "portfolio_value": float(s.portfolio_value or 0),
                "var_95": float(s.var_95 or 0),
                "sharpe": float(s.sharpe or 0),
                "volatility": float(s.volatility or 0),
                "max_drawdown": float(s.max_drawdown or 0),
            }
        )

    return portfolio, holdings_data, risk_data, history_data


@router.get("/{portfolio_id}/pdf")
async def export_pdf(
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Generate and stream a PDF risk report for the portfolio."""
    portfolio, holdings_data, risk_data, _ = await _build_context(
        portfolio_id, current_user, db
    )
    pdf_bytes = export_service.generate_pdf(portfolio.name, holdings_data, risk_data)

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{portfolio.name}_risk_report.pdf"'
        },
    )


@router.get("/{portfolio_id}/excel")
async def export_excel(
    portfolio_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Generate and stream an Excel risk report for the portfolio."""
    portfolio, holdings_data, risk_data, history_data = await _build_context(
        portfolio_id, current_user, db
    )
    excel_bytes = export_service.generate_excel(
        portfolio.name, holdings_data, risk_data, history_data
    )

    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{portfolio.name}_risk_report.xlsx"'
        },
    )
