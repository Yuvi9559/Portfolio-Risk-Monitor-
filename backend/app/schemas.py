from __future__ import annotations
from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator


# ── Auth ──────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str


# ── Portfolio ─────────────────────────────────────────────────
class PortfolioCreate(BaseModel):
    name: str = "My Portfolio"
    benchmark: str = "SPY"


class PortfolioResponse(BaseModel):
    id: UUID
    name: str
    benchmark: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Holdings ──────────────────────────────────────────────────
class HoldingAdd(BaseModel):
    ticker: str
    shares: float
    avg_cost: Optional[float] = None

    @field_validator("ticker")
    @classmethod
    def uppercase_ticker(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("shares")
    @classmethod
    def positive_shares(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Shares must be positive")
        return v


class HoldingResponse(BaseModel):
    id: UUID
    ticker: str
    shares: float
    avg_cost: Optional[float]
    current_price: Optional[float] = None
    market_value: Optional[float] = None
    pnl_pct: Optional[float] = None

    model_config = {"from_attributes": True}


# ── Risk Metrics ──────────────────────────────────────────────
class RiskMetrics(BaseModel):
    portfolio_id: str
    computed_at: datetime
    portfolio_value: float
    daily_return_pct: float

    # Risk metrics
    var_95: float           # Value at Risk 95% (as % of portfolio)
    cvar_95: float          # Conditional VaR 95%
    var_99: float           # Value at Risk 99%
    var_95_dollar: float    # VaR in dollar terms
    sharpe: float
    sortino: float
    beta: float
    max_drawdown: float     # as negative percentage

    # Holdings breakdown
    holdings: list[HoldingResponse]

    # Correlation matrix
    correlation: dict       # {ticker: {ticker: corr_value}}
    weights: dict           # {ticker: weight}
