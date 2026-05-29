import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

const fmt = (n, d = 2) => (typeof n === "number" ? n.toFixed(d) : "—");
const pct  = (n, d = 2) => `${(n * 100).toFixed(d)}%`;
const usd  = (n) => `$${n?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"}`;

function MetricCard({ label, value, sub, color, large }) {
  return (
    <div className={`metric-card ${large ? "large" : ""}`} style={color ? {"--accent": color} : {}}>
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={color ? {color} : {}}>{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

export default function RiskMetricsPanel({ data }) {
  const {
    portfolio_value, daily_return_pct,
    var_95, cvar_95, var_99, var_95_dollar,
    sharpe, sortino, beta, max_drawdown,
    holdings, weights,
  } = data;

  const returnColor = daily_return_pct >= 0 ? "#16a34a" : "#dc2626";
  const varColor    = "#dc2626";

  // Weights pie data for simple bar chart
  const weightData = Object.entries(weights || {}).map(([ticker, w]) => ({
    ticker,
    weight: (w * 100).toFixed(1),
  }));

  return (
    <div className="risk-panel">
      {/* ── Portfolio summary ── */}
      <div className="metrics-grid top-metrics">
        <MetricCard
          large
          label="Portfolio Value"
          value={usd(portfolio_value)}
          sub="Current market value"
        />
        <MetricCard
          label="Today's Return"
          value={`${daily_return_pct >= 0 ? "+" : ""}${fmt(daily_return_pct, 3)}%`}
          color={returnColor}
          sub="Latest daily log-return"
        />
        <MetricCard
          label="VaR 95%"
          value={pct(var_95)}
          sub={`~${usd(var_95_dollar)} at risk`}
          color={varColor}
        />
        <MetricCard
          label="CVaR 95%"
          value={pct(cvar_95)}
          sub="Expected shortfall"
          color={varColor}
        />
      </div>

      {/* ── Risk ratios ── */}
      <div className="metrics-grid ratio-metrics">
        <MetricCard label="Sharpe Ratio"  value={fmt(sharpe, 3)}  sub="Annualised (252d)" />
        <MetricCard label="Sortino Ratio" value={fmt(sortino, 3)} sub="Downside deviation" />
        <MetricCard label="Beta (vs SPY)" value={fmt(beta, 3)}    sub="Market sensitivity" />
        <MetricCard label="Max Drawdown"  value={pct(max_drawdown)} sub="Peak-to-trough" color={varColor} />
        <MetricCard label="VaR 99%"       value={pct(var_99)}     sub="99% confidence" color={varColor} />
      </div>

      {/* ── Holdings table ── */}
      <div className="section-block">
        <div className="section-title">Holdings</div>
        <div className="holdings-table-wrap">
          <table className="holdings-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Shares</th>
                <th>Price</th>
                <th>Value</th>
                <th>Weight</th>
                <th>P&L</th>
              </tr>
            </thead>
            <tbody>
              {(holdings || []).map(h => (
                <tr key={h.ticker}>
                  <td className="ticker-cell">{h.ticker}</td>
                  <td>{fmt(h.shares)}</td>
                  <td>{h.current_price ? usd(h.current_price) : "—"}</td>
                  <td>{h.market_value  ? usd(h.market_value) : "—"}</td>
                  <td>{weights?.[h.ticker] ? pct(weights[h.ticker]) : "—"}</td>
                  <td className={h.pnl_pct >= 0 ? "pos" : "neg"}>
                    {h.pnl_pct != null ? `${h.pnl_pct >= 0 ? "+" : ""}${h.pnl_pct}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Weight breakdown ── */}
      {weightData.length > 0 && (
        <div className="section-block">
          <div className="section-title">Portfolio Weights</div>
          <div className="weight-bars">
            {weightData.map(({ ticker, weight }) => (
              <div key={ticker} className="weight-row">
                <span className="weight-ticker">{ticker}</span>
                <div className="weight-bar-wrap">
                  <div className="weight-bar-fill" style={{ width: `${weight}%` }} />
                </div>
                <span className="weight-pct">{weight}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
