from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


# ─────────────────────────────────────────────────────────────────────────────
# Auth
# ─────────────────────────────────────────────────────────────────────────────
class GoogleAuthRequest(BaseModel):
    id_token: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Portfolio
# ─────────────────────────────────────────────────────────────────────────────
class PortfolioCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    benchmark: str = "SPY"
    currency: str = "USD"


class PortfolioResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    benchmark: str
    currency: str
    created_at: datetime


# ─────────────────────────────────────────────────────────────────────────────
# Holding
# ─────────────────────────────────────────────────────────────────────────────
class HoldingAdd(BaseModel):
    symbol: str
    asset_type: str = "stock"
    shares: float
    avg_cost: Optional[float] = None

    @field_validator("symbol", mode="before")
    @classmethod
    def uppercase_symbol(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("shares", mode="before")
    @classmethod
    def positive_shares(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("shares must be a positive number")
        return v


class HoldingResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    symbol: str
    asset_type: str
    shares: float
    avg_cost: Optional[float] = None
    current_price: Optional[float] = None
    market_value: Optional[float] = None
    pnl_pct: Optional[float] = None
    pnl_dollar: Optional[float] = None


# ─────────────────────────────────────────────────────────────────────────────
# Monte Carlo
# ─────────────────────────────────────────────────────────────────────────────
class MonteCarloResult(BaseModel):
    percentile_5: List[float]
    percentile_50: List[float]
    percentile_95: List[float]
    days: List[int]
    current_value: float


# ─────────────────────────────────────────────────────────────────────────────
# Risk Metrics
# ─────────────────────────────────────────────────────────────────────────────
class RiskMetrics(BaseModel):
    portfolio_id: str
    portfolio_value: float
    daily_return_pct: float
    var_95: float
    cvar_95: float
    var_99: float
    var_95_dollar: float
    sharpe: float
    sortino: float
    beta: float
    max_drawdown: float
    volatility: float
    correlation: Dict[str, Any]
    weights: Dict[str, float]
    monte_carlo: Dict[str, Any]
    holdings: List[HoldingResponse]


# ─────────────────────────────────────────────────────────────────────────────
# News
# ─────────────────────────────────────────────────────────────────────────────
class NewsItem(BaseModel):
    symbol: str
    headline: str
    url: Optional[str] = None
    sentiment_score: float
    sentiment_label: str
    published_at: Optional[datetime] = None


# ─────────────────────────────────────────────────────────────────────────────
# Risk history snapshot (returned from /history endpoint)
# ─────────────────────────────────────────────────────────────────────────────
class RiskSnapshotResponse(BaseModel):
    model_config = {"from_attributes": True}

    ts: datetime
    portfolio_value: Optional[float] = None
    daily_return: Optional[float] = None
    var_95: Optional[float] = None
    cvar_95: Optional[float] = None
    var_99: Optional[float] = None
    var_95_dollar: Optional[float] = None
    sharpe: Optional[float] = None
    sortino: Optional[float] = None
    beta: Optional[float] = None
    max_drawdown: Optional[float] = None
    volatility: Optional[float] = None
