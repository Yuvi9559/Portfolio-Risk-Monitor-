import React from 'react';

function SkeletonCard() {
  return (
    <div className="risk-card">
      <div className="risk-card-top">
        <div className="skeleton skeleton-text" style={{ width: '55%' }} />
      </div>
      <div className="skeleton skeleton-value" />
      <div className="skeleton skeleton-desc" />
    </div>
  );
}

function MetricCard({ label, value, formatted, description, colorClass, tooltip, prefix = '', suffix = '' }) {
  return (
    <div className={`risk-card ${colorClass === 'danger' ? 'danger' : colorClass === 'warning' ? 'warning' : ''}`}>
      <div className="risk-card-top">
        <div className="risk-label">{label}</div>
        {tooltip && (
          <div className="risk-tooltip-icon" title={tooltip}>ⓘ</div>
        )}
      </div>
      <div className={`risk-value ${colorClass || ''}`}>
        {prefix}{formatted ?? value}{suffix}
      </div>
      {description && <div className="risk-desc">{description}</div>}
    </div>
  );
}

function formatCurrency(val, currency = 'USD') {
  if (val == null || isNaN(val)) return '—';
  const symbols = { USD: '$', INR: '₹', EUR: '€', GBP: '£' };
  const sym = symbols[currency] || '$';
  const abs = Math.abs(val);
  let str;
  if (abs >= 1_000_000) str = `${sym}${(val / 1_000_000).toFixed(2)}M`;
  else if (abs >= 1_000) str = `${sym}${(val / 1_000).toFixed(2)}K`;
  else str = `${sym}${val.toFixed(2)}`;
  return str;
}

function formatPct(val) {
  if (val == null || isNaN(val)) return '—';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${(val * 100).toFixed(2)}%`;
}

function formatRaw(val, decimals = 4) {
  if (val == null || isNaN(val)) return '—';
  return Number(val).toFixed(decimals);
}

function getSharpeColor(v) {
  if (v == null) return '';
  if (v >= 1) return 'accent';
  if (v >= 0) return 'warning';
  return 'danger';
}

function getDailyPnlClass(v) {
  if (v == null) return '';
  return v >= 0 ? 'positive' : 'negative';
}

export default function RiskMetricsPanel({ riskData, currency = 'USD' }) {
  if (!riskData) {
    return (
      <div>
        <div className="risk-grid" style={{ marginBottom: 16 }}>
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="risk-grid-secondary">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  // ── Exact field names from backend RiskMetrics schema ──────────────────────
  const {
    portfolio_value,
    daily_return_pct,   // backend: daily_return_pct  (was wrongly read as daily_pnl_pct)
    var_95,
    var_99,
    cvar_95,
    sharpe,             // backend: sharpe             (was wrongly read as sharpe_ratio)
    sortino,            // backend: sortino             (was wrongly read as sortino_ratio)
    max_drawdown,
    volatility,
    beta,
    var_95_dollar,      // backend: var_95_dollar       (dollar VaR)
  } = riskData;

  // daily_return_pct comes as a percentage already (e.g. 0.12 means 0.12 %)
  const dailyPnlColor = getDailyPnlClass(daily_return_pct);
  const pnlArrow = (daily_return_pct ?? 0) >= 0 ? '▲' : '▼';
  const sharpeColor = getSharpeColor(sharpe);

  return (
    <div>
      {/* Primary metrics */}
      <div className="risk-grid" style={{ marginBottom: 16 }}>
        <MetricCard
          label="Portfolio Value"
          formatted={formatCurrency(portfolio_value, currency)}
          description="Total current market value"
          colorClass="accent"
          tooltip="Sum of all holdings at current market price"
        />
        <MetricCard
          label="Daily Return"
          formatted={`${pnlArrow} ${daily_return_pct != null ? Math.abs(daily_return_pct).toFixed(4) : '—'}%`}
          description="Portfolio mean daily return"
          colorClass={dailyPnlColor}
          tooltip="Average daily return of the portfolio based on historical prices"
        />
        <MetricCard
          label="VaR 95% (1-Day)"
          formatted={`${var_95 != null ? var_95.toFixed(2) : '—'}%  /  ${formatCurrency(var_95_dollar, currency)}`}
          description="Max expected 1-day loss at 95% confidence"
          colorClass="danger"
          tooltip="Value at Risk: there is a 5% chance of losing more than this amount in a single trading day"
        />
        <MetricCard
          label="Sharpe Ratio"
          formatted={formatRaw(sharpe, 2)}
          description={sharpe >= 1 ? 'Excellent risk-adjusted return' : sharpe >= 0 ? 'Acceptable performance' : 'Poor risk-adjusted return'}
          colorClass={sharpeColor}
          tooltip="(Return - Risk-free rate) / Volatility. Higher is better. ≥1 is considered good."
        />
        <MetricCard
          label="Max Drawdown"
          formatted={`${max_drawdown != null ? max_drawdown.toFixed(2) : '—'}%`}
          description="Largest peak-to-trough decline"
          colorClass="danger"
          tooltip="Percentage decline from the highest portfolio value to the lowest"
        />
        <MetricCard
          label="Portfolio Volatility"
          formatted={`${volatility != null ? volatility.toFixed(2) : '—'}%`}
          description="Annualised standard deviation"
          colorClass=""
          tooltip="Annualised volatility of portfolio returns"
        />
      </div>

      {/* Secondary metrics */}
      <div className="risk-grid-secondary">
        <MetricCard
          label="Sortino Ratio"
          formatted={formatRaw(sortino, 2)}
          description="Downside risk-adjusted return"
          colorClass={getSharpeColor(sortino)}
          tooltip="Like Sharpe, but only penalises downside volatility"
        />
        <MetricCard
          label="Portfolio Beta"
          formatted={formatRaw(beta, 2)}
          description="Sensitivity to benchmark"
          colorClass=""
          tooltip="Beta > 1 means more volatile than benchmark; < 1 means less volatile"
        />
        <MetricCard
          label="VaR 99% (1-Day)"
          formatted={`${var_99 != null ? var_99.toFixed(2) : '—'}%`}
          description="Max expected 1-day loss at 99% confidence"
          colorClass="danger"
          tooltip="Only 1% chance of losing more than this in a single day"
        />
        <MetricCard
          label="CVaR 95%"
          formatted={`${cvar_95 != null ? cvar_95.toFixed(2) : '—'}%`}
          description="Expected loss beyond VaR 95%"
          colorClass="danger"
          tooltip="Conditional VaR (Expected Shortfall): average loss when loss exceeds VaR 95%"
        />
      </div>
    </div>
  );
}
