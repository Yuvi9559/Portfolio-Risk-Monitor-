import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Numeric, BigInteger,
    ForeignKey, DateTime, UniqueConstraint, Boolean
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email      = Column(Text, unique=True, nullable=False, index=True)
    hashed_pw  = Column(Text, nullable=False)
    full_name  = Column(Text)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    portfolios = relationship("Portfolio", back_populates="user", cascade="all, delete-orphan")


class Portfolio(Base):
    __tablename__ = "portfolios"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name       = Column(Text, nullable=False, default="My Portfolio")
    benchmark  = Column(Text, nullable=False, default="SPY")
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user     = relationship("User", back_populates="portfolios")
    holdings = relationship("Holding", back_populates="portfolio", cascade="all, delete-orphan")


class Holding(Base):
    __tablename__ = "holdings"
    __table_args__ = (UniqueConstraint("portfolio_id", "ticker"),)

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    portfolio_id = Column(UUID(as_uuid=True), ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False)
    ticker       = Column(Text, nullable=False)
    shares       = Column(Numeric(14, 4), nullable=False)
    avg_cost     = Column(Numeric(14, 4))
    added_at     = Column(DateTime(timezone=True), default=utcnow)

    portfolio = relationship("Portfolio", back_populates="holdings")


class Price(Base):
    __tablename__ = "prices"

    ticker = Column(Text, primary_key=True)
    ts     = Column(DateTime(timezone=True), primary_key=True)
    open   = Column(Numeric(14, 4))
    high   = Column(Numeric(14, 4))
    low    = Column(Numeric(14, 4))
    close  = Column(Numeric(14, 4), nullable=False)
    volume = Column(BigInteger)


class RiskSnapshot(Base):
    __tablename__ = "risk_snapshots"

    portfolio_id    = Column(UUID(as_uuid=True), ForeignKey("portfolios.id", ondelete="CASCADE"), primary_key=True)
    ts              = Column(DateTime(timezone=True), primary_key=True, default=utcnow)
    portfolio_value = Column(Numeric(16, 2))
    daily_return    = Column(Numeric(10, 6))
    var_95          = Column(Numeric(10, 4))
    cvar_95         = Column(Numeric(10, 4))
    var_99          = Column(Numeric(10, 4))
    sharpe          = Column(Numeric(8, 4))
    sortino         = Column(Numeric(8, 4))
    beta            = Column(Numeric(8, 4))
    max_drawdown    = Column(Numeric(8, 4))
