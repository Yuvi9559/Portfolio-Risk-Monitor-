from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Result dataclass
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class RiskResult:
    portfolio_value: float
    daily_return_pct: float
    var_95: float        # percentage-form (e.g., -1.23 means -1.23 %)
    cvar_95: float
    var_99: float
    var_95_dollar: float
    sharpe: float
    sortino: float
    beta: float
    max_drawdown: float  # negative percentage (e.g., -15.3)
    volatility: float    # annualised percentage
    correlation: Dict    # symbol → symbol → float
    weights: Dict        # symbol → weight float


# ─────────────────────────────────────────────────────────────────────────────
# Portfolio risk computation
# ─────────────────────────────────────────────────────────────────────────────
def compute_portfolio_risk(
    prices_df: pd.DataFrame,
    holdings_dict: Dict[str, float],  # symbol → shares
    benchmark_series: Optional[pd.Series] = None,
    risk_free: float = 0.05,
) -> RiskResult:
    """Compute comprehensive portfolio risk metrics.

    Parameters
    ----------
    prices_df : pd.DataFrame
        Close prices with symbols as columns, dates as index.
    holdings_dict : dict
        {symbol: shares}
    benchmark_series : pd.Series, optional
        Close prices of the benchmark (same freq as prices_df).
    risk_free : float
        Annual risk-free rate (0.05 = 5%).
    """
    # ── Align holdings to available price columns ────────────────────────────
    available = [s for s in holdings_dict if s in prices_df.columns]
    if not available:
        logger.warning("No overlapping symbols between holdings and price data.")
        return _empty_result()

    prices_df = prices_df[available].copy()

    # ── Current market values & weights ──────────────────────────────────────
    latest_prices = prices_df.iloc[-1]
    market_values: Dict[str, float] = {
        sym: latest_prices[sym] * holdings_dict[sym]
        for sym in available
        if not math.isnan(latest_prices[sym])
    }
    portfolio_value = sum(market_values.values())

    if portfolio_value <= 0:
        return _empty_result()

    weights: Dict[str, float] = {
        sym: mv / portfolio_value for sym, mv in market_values.items()
    }

    # ── Daily returns ─────────────────────────────────────────────────────────
    returns_df = prices_df[list(weights.keys())].pct_change().dropna()

    if len(returns_df) < 2:
        logger.warning("Insufficient price history for risk calculation.")
        return _empty_result()

    # ── Portfolio daily returns (weighted sum) ────────────────────────────────
    weight_array = np.array([weights[sym] for sym in returns_df.columns])
    port_returns: np.ndarray = returns_df.values @ weight_array

    mean_return = float(np.mean(port_returns))
    std_return = float(np.std(port_returns, ddof=1))

    # ── VaR & CVaR (historical simulation) ───────────────────────────────────
    var_95 = float(np.percentile(port_returns, 5)) * 100          # 5th pct → lower tail
    var_99 = float(np.percentile(port_returns, 1)) * 100
    cvar_threshold = np.percentile(port_returns, 5)
    cvar_95 = float(np.mean(port_returns[port_returns <= cvar_threshold])) * 100
    var_95_dollar = abs(var_95 / 100) * portfolio_value

    # ── Sharpe ratio ──────────────────────────────────────────────────────────
    ann_return = mean_return * 252
    ann_std = std_return * math.sqrt(252)
    sharpe = (ann_return - risk_free) / ann_std if ann_std > 0 else 0.0

    # ── Sortino ratio ─────────────────────────────────────────────────────────
    downside_returns = port_returns[port_returns < 0]
    if len(downside_returns) > 0:
        downside_std = float(np.std(downside_returns, ddof=1)) * math.sqrt(252)
        sortino = (ann_return - risk_free) / downside_std if downside_std > 0 else 0.0
    else:
        sortino = 0.0

    # ── Beta ──────────────────────────────────────────────────────────────────
    beta = 0.0
    if benchmark_series is not None and not benchmark_series.empty:
        try:
            bench_ret = benchmark_series.pct_change().dropna()
            # Align dates
            aligned = pd.concat(
                [pd.Series(port_returns, index=returns_df.index), bench_ret],
                axis=1,
                join="inner",
            ).dropna()
            if len(aligned) >= 20:
                p_ret = aligned.iloc[:, 0].values
                b_ret = aligned.iloc[:, 1].values
                cov_matrix = np.cov(p_ret, b_ret)
                beta = float(cov_matrix[0, 1] / cov_matrix[1, 1]) if cov_matrix[1, 1] != 0 else 0.0
        except Exception as exc:
            logger.warning("Beta calculation failed: %s", exc)

    # ── Max Drawdown ──────────────────────────────────────────────────────────
    cumulative = (1 + pd.Series(port_returns)).cumprod()
    rolling_max = cumulative.cummax()
    drawdown = (cumulative - rolling_max) / rolling_max
    max_drawdown = float(drawdown.min()) * 100  # negative value

    # ── Annualised Volatility ─────────────────────────────────────────────────
    volatility = ann_std * 100

    # ── Correlation ───────────────────────────────────────────────────────────
    try:
        corr = returns_df.corr()
        # Replace NaN with 0 for JSON serialisation
        corr = corr.fillna(0)
        correlation = {
            str(col): {str(idx): round(float(v), 4) for idx, v in corr[col].items()}
            for col in corr.columns
        }
    except Exception as exc:
        logger.warning("Correlation calculation failed: %s", exc)
        correlation = {}

    return RiskResult(
        portfolio_value=round(portfolio_value, 4),
        daily_return_pct=round(mean_return * 100, 4),
        var_95=round(var_95, 4),
        cvar_95=round(cvar_95, 4),
        var_99=round(var_99, 4),
        var_95_dollar=round(var_95_dollar, 4),
        sharpe=round(sharpe, 4),
        sortino=round(sortino, 4),
        beta=round(beta, 4),
        max_drawdown=round(max_drawdown, 4),
        volatility=round(volatility, 4),
        correlation=correlation,
        weights={k: round(v, 4) for k, v in weights.items()},
    )


def _empty_result() -> RiskResult:
    return RiskResult(
        portfolio_value=0.0,
        daily_return_pct=0.0,
        var_95=0.0,
        cvar_95=0.0,
        var_99=0.0,
        var_95_dollar=0.0,
        sharpe=0.0,
        sortino=0.0,
        beta=0.0,
        max_drawdown=0.0,
        volatility=0.0,
        correlation={},
        weights={},
    )


# ─────────────────────────────────────────────────────────────────────────────
# Monte Carlo simulation
# ─────────────────────────────────────────────────────────────────────────────
def run_monte_carlo(
    current_value: float,
    mean_return: float,
    volatility: float,
    days: int = 90,
    simulations: int = 1000,
) -> dict:
    """Simulate portfolio value paths using Geometric Brownian Motion.

    Parameters
    ----------
    current_value : float
        Current portfolio value in currency units.
    mean_return : float
        Daily mean return (decimal). Pass daily_return_pct / 100.
    volatility : float
        Annualised volatility (decimal). Pass risk_engine_volatility / 100.
    days : int
        Forecast horizon in trading days.
    simulations : int
        Number of Monte Carlo paths.

    Returns
    -------
    dict with keys:
        days        – list of day indices 1..days
        p5          – 5th percentile portfolio value at each day
        p50         – median portfolio value at each day
        p95         – 95th percentile portfolio value at each day
        current_value
    """
    if current_value <= 0 or days <= 0 or simulations <= 0:
        return {
            "days": [],
            "p5": [],
            "p50": [],
            "p95": [],
            "current_value": current_value,
        }

    # Convert annualised volatility to daily
    daily_vol = volatility / math.sqrt(252)
    daily_drift = mean_return - 0.5 * daily_vol ** 2

    # Shape: (simulations, days)
    rng = np.random.default_rng(seed=42)
    random_shocks = rng.normal(0, 1, size=(simulations, days))
    daily_log_returns = daily_drift + daily_vol * random_shocks

    # Cumulative log returns → price paths
    cumulative_log = np.cumsum(daily_log_returns, axis=1)
    price_paths = current_value * np.exp(cumulative_log)

    p5 = np.percentile(price_paths, 5, axis=0).tolist()
    p50 = np.percentile(price_paths, 50, axis=0).tolist()
    p95 = np.percentile(price_paths, 95, axis=0).tolist()

    return {
        "days": list(range(1, days + 1)),
        "p5": [round(v, 2) for v in p5],
        "p50": [round(v, 2) for v in p50],
        "p95": [round(v, 2) for v in p95],
        "current_value": round(current_value, 2),
    }
