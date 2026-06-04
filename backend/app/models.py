from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Numeric,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ─────────────────────────────────────────────────────────────────────────────
# User
# ─────────────────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    google_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_reports: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    report_frequency: Mapped[str] = mapped_column(
        Text, default="weekly", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    portfolios: Mapped[list["Portfolio"]] = relationship(
        "Portfolio", back_populates="owner", cascade="all, delete-orphan"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Portfolio
# ─────────────────────────────────────────────────────────────────────────────
class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    benchmark: Mapped[str] = mapped_column(Text, default="SPY", nullable=False)
    currency: Mapped[str] = mapped_column(Text, default="USD", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    owner: Mapped["User"] = relationship("User", back_populates="portfolios")
    holdings: Mapped[list["Holding"]] = relationship(
        "Holding", back_populates="portfolio", cascade="all, delete-orphan"
    )
    risk_snapshots: Mapped[list["RiskSnapshot"]] = relationship(
        "RiskSnapshot", back_populates="portfolio", cascade="all, delete-orphan"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Holding
# ─────────────────────────────────────────────────────────────────────────────
class Holding(Base):
    __tablename__ = "holdings"
    __table_args__ = (UniqueConstraint("portfolio_id", "symbol", name="uq_holding"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("portfolios.id", ondelete="CASCADE"),
        nullable=False,
    )
    symbol: Mapped[str] = mapped_column(Text, nullable=False)
    asset_type: Mapped[str] = mapped_column(Text, default="stock", nullable=False)
    shares: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)
    avg_cost: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    portfolio: Mapped["Portfolio"] = relationship("Portfolio", back_populates="holdings")


# ─────────────────────────────────────────────────────────────────────────────
# Price (time-series, composite PK)
# ─────────────────────────────────────────────────────────────────────────────
class Price(Base):
    __tablename__ = "prices"

    symbol: Mapped[str] = mapped_column(Text, primary_key=True, nullable=False)
    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False
    )
    open: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    high: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    low: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    close: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)
    volume: Mapped[int | None] = mapped_column(BigInteger, nullable=True)


# ─────────────────────────────────────────────────────────────────────────────
# RiskSnapshot
# ─────────────────────────────────────────────────────────────────────────────
class RiskSnapshot(Base):
    __tablename__ = "risk_snapshots"

    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("portfolios.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False
    )
    portfolio_value: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    daily_return: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    var_95: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    cvar_95: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    var_99: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    var_95_dollar: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    sharpe: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    sortino: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    beta: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    max_drawdown: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    volatility: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)

    portfolio: Mapped["Portfolio"] = relationship(
        "Portfolio", back_populates="risk_snapshots"
    )


# ─────────────────────────────────────────────────────────────────────────────
# NewsCache
# ─────────────────────────────────────────────────────────────────────────────
class NewsCache(Base):
    __tablename__ = "news_cache"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    symbol: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    headline: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    sentiment_score: Mapped[float | None] = mapped_column(
        Numeric(5, 3), nullable=True
    )
    sentiment_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cached_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
