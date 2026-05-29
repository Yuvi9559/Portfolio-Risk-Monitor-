"""
Risk Engine
===========
Pure-NumPy risk computation. Given a matrix of daily log-returns,
computes the full suite of portfolio risk metrics.

All metrics are computed using historical simulation (non-parametric)
so no normality assumption is made — appropriate for fat-tailed equity returns.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from dataclasses import dataclass
from typing import Optional
from app.config import get_settings

settings = get_settings()
TRADING_DAYS = 252
RF = settings.RISK_FREE_RATE / TRADING_DAYS   # daily risk-free rate


@dataclass
class RiskResult:
    portfolio_value: float
    daily_return_pct: float

    var_95: float        # % of portfolio (e.g. 0.023 = 2.3% loss at 95% VaR)
    cvar_95: float       # expected loss beyond VaR at 95%
    var_99: float
    var_95_dollar: float # VaR in $ terms

    sharpe: float        # annualised
    sortino: float       # annualised
    beta: float          # vs benchmark (SPY)
    max_drawdown: float  # negative number, e.g. -0.34 = -34%

    weights: dict[str, float]        # {ticker: weight}
    correlation: dict[str, dict]     # {ticker: {ticker: corr}}


def compute_portfolio_risk(
    prices: pd.DataFrame,           # columns = tickers, index = date (must include benchmark)
    holdings: dict[str, float],     # {ticker: shares}
    benchmark: str = "SPY",
    portfolio_value: Optional[float] = None,
) -> RiskResult:
    """
    Main entry point.

    Parameters
    ----------
    prices      : DataFrame of close prices. Must contain benchmark column.
    holdings    : dict of {ticker: shares}.
    benchmark   : Benchmark ticker string (default SPY).
    portfolio_value : Current market value. Computed from prices if None.
    """
    tickers = [t for t in holdings if t in prices.columns]
    if not tickers:
        raise ValueError("No valid tickers with price data")

    # ── Current portfolio value ───────────────────────────────
    latest = prices[tickers].iloc[-1]
    shares = pd.Series({t: holdings[t] for t in tickers})
    market_values = latest * shares
    total_value = float(market_values.sum())
    if portfolio_value is None:
        portfolio_value = total_value

    # ── Weights ───────────────────────────────────────────────
    weights = (market_values / total_value).to_dict()

    # ── Daily log returns ─────────────────────────────────────
    rets = np.log(prices[tickers] / prices[tickers].shift(1)).dropna()
    bench_rets = np.log(prices[benchmark] / prices[benchmark].shift(1)).dropna()

    if len(rets) < 30:
        raise ValueError("Not enough price history (need at least 30 days)")

    # Align on common dates
    common_idx = rets.index.intersection(bench_rets.index)
    rets = rets.loc[common_idx]
    bench_rets = bench_rets.loc[common_idx]

    # ── Portfolio returns (weighted sum of log-returns) ────────
    w = np.array([weights[t] for t in tickers])
    port_rets = rets[tickers].values @ w   # shape: (n_days,)

    # ── VaR & CVaR (Historical Simulation) ───────────────────
    var_95 = float(-np.percentile(port_rets, 5))
    var_99 = float(-np.percentile(port_rets, 1))
    cvar_95 = float(-port_rets[port_rets <= -var_95].mean())
    var_95_dollar = var_95 * portfolio_value

    # ── Sharpe Ratio ──────────────────────────────────────────
    excess = port_rets - RF
    sharpe = float(np.mean(excess) / np.std(port_rets, ddof=1) * np.sqrt(TRADING_DAYS))

    # ── Sortino Ratio ─────────────────────────────────────────
    downside = port_rets[port_rets < 0]
    downside_std = np.std(downside, ddof=1) if len(downside) > 1 else 1e-9
    sortino = float(np.mean(excess) / downside_std * np.sqrt(TRADING_DAYS))

    # ── Beta ──────────────────────────────────────────────────
    bench_arr = bench_rets.values
    cov = np.cov(port_rets, bench_arr)
    beta = float(cov[0, 1] / cov[1, 1]) if cov[1, 1] != 0 else 1.0

    # ── Maximum Drawdown ──────────────────────────────────────
    cum = np.exp(np.cumsum(port_rets))
    rolling_max = np.maximum.accumulate(cum)
    drawdowns = (cum - rolling_max) / rolling_max
    max_drawdown = float(np.min(drawdowns))

    # ── Correlation Matrix ────────────────────────────────────
    corr_df = rets[tickers].corr()
    correlation = {
        t: {t2: round(float(corr_df.loc[t, t2]), 4) for t2 in tickers}
        for t in tickers
    }

    # ── Daily return of portfolio ─────────────────────────────
    daily_return_pct = float(port_rets[-1]) * 100  # latest day return %

    return RiskResult(
        portfolio_value=round(portfolio_value, 2),
        daily_return_pct=round(daily_return_pct, 4),
        var_95=round(var_95, 6),
        cvar_95=round(cvar_95, 6),
        var_99=round(var_99, 6),
        var_95_dollar=round(var_95_dollar, 2),
        sharpe=round(sharpe, 4),
        sortino=round(sortino, 4),
        beta=round(beta, 4),
        max_drawdown=round(max_drawdown, 4),
        weights={k: round(v, 4) for k, v in weights.items()},
        correlation=correlation,
    )
