-- ============================================================
-- Portfolio Risk Monitor — Database Schema
-- PostgreSQL + TimescaleDB
-- ============================================================

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         TEXT UNIQUE NOT NULL,
    hashed_pw     TEXT NOT NULL,
    full_name     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Portfolios ────────────────────────────────────────────────
CREATE TABLE portfolios (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL DEFAULT 'My Portfolio',
    benchmark     TEXT NOT NULL DEFAULT 'SPY',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_portfolios_user ON portfolios(user_id);

-- ── Holdings ─────────────────────────────────────────────────
CREATE TABLE holdings (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id  UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    ticker        TEXT NOT NULL,
    shares        NUMERIC(14,4) NOT NULL,
    avg_cost      NUMERIC(14,4),
    added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(portfolio_id, ticker)
);

CREATE INDEX idx_holdings_portfolio ON holdings(portfolio_id);

-- ── Price History (TimescaleDB hypertable) ────────────────────
CREATE TABLE prices (
    ticker        TEXT NOT NULL,
    ts            TIMESTAMPTZ NOT NULL,
    open          NUMERIC(14,4),
    high          NUMERIC(14,4),
    low           NUMERIC(14,4),
    close         NUMERIC(14,4) NOT NULL,
    volume        BIGINT,
    PRIMARY KEY (ticker, ts)
);

SELECT create_hypertable('prices', 'ts', if_not_exists => TRUE);
CREATE INDEX idx_prices_ticker ON prices(ticker, ts DESC);

-- Continuous aggregate: daily OHLCV bars
CREATE MATERIALIZED VIEW prices_daily
WITH (timescaledb.continuous) AS
SELECT
    ticker,
    time_bucket('1 day', ts)   AS day,
    first(open,  ts)           AS open,
    max(high)                  AS high,
    min(low)                   AS low,
    last(close,  ts)           AS close,
    sum(volume)                AS volume
FROM prices
GROUP BY ticker, time_bucket('1 day', ts)
WITH NO DATA;

-- ── Risk Snapshots (TimescaleDB hypertable) ───────────────────
CREATE TABLE risk_snapshots (
    portfolio_id  UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    ts            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    portfolio_value NUMERIC(16,2),
    daily_return    NUMERIC(10,6),
    var_95        NUMERIC(10,4),   -- Value at Risk 95%
    cvar_95       NUMERIC(10,4),   -- CVaR / Expected Shortfall 95%
    var_99        NUMERIC(10,4),   -- Value at Risk 99%
    sharpe        NUMERIC(8,4),
    sortino       NUMERIC(8,4),
    beta          NUMERIC(8,4),
    max_drawdown  NUMERIC(8,4),
    PRIMARY KEY (portfolio_id, ts)
);

SELECT create_hypertable('risk_snapshots', 'ts', if_not_exists => TRUE);

-- ── Refresh policy for continuous aggregate ───────────────────
SELECT add_continuous_aggregate_policy('prices_daily',
    start_offset => INTERVAL '3 days',
    end_offset   => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);
