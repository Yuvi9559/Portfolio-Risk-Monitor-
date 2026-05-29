import { useState, useEffect } from "react";
import { api } from "../services/api";

export default function PortfolioBuilder({ token, portfolioId, onUpdate }) {
  const [holdings, setHoldings] = useState([]);
  const [ticker,   setTicker]   = useState("");
  const [shares,   setShares]   = useState("");
  const [avgCost,  setAvgCost]  = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const load = () => api.getHoldings(token, portfolioId).then(setHoldings);

  useEffect(() => { load(); }, [portfolioId]);

  const add = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.addHolding(token, portfolioId, ticker, parseFloat(shares), avgCost ? parseFloat(avgCost) : null);
      setTicker(""); setShares(""); setAvgCost("");
      await load();
      onUpdate?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const remove = async (t) => {
    await api.removeHolding(token, portfolioId, t);
    await load();
    onUpdate?.();
  };

  return (
    <div className="builder-wrap">
      <div className="section-title">Manage Holdings</div>

      <form className="add-holding-form" onSubmit={add}>
        <div className="form-row">
          <input
            placeholder="Ticker (e.g. AAPL)"
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            required
            className="input ticker-input"
          />
          <input
            placeholder="Shares"
            type="number"
            min="0.0001"
            step="any"
            value={shares}
            onChange={e => setShares(e.target.value)}
            required
            className="input"
          />
          <input
            placeholder="Avg cost (optional)"
            type="number"
            min="0"
            step="any"
            value={avgCost}
            onChange={e => setAvgCost(e.target.value)}
            className="input"
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Adding…" : "Add"}
          </button>
        </div>
        {error && <div className="form-error">{error}</div>}
      </form>

      <div className="holdings-list">
        {holdings.length === 0
          ? <div className="empty-hint">No holdings yet. Add tickers above.</div>
          : holdings.map(h => (
            <div key={h.ticker} className="holding-row">
              <div className="holding-info">
                <span className="holding-ticker">{h.ticker}</span>
                <span className="holding-shares">{h.shares} shares</span>
                {h.avg_cost && <span className="holding-cost">avg ${h.avg_cost}</span>}
              </div>
              <div className="holding-right">
                {h.current_price && (
                  <span className="holding-price">${h.current_price?.toFixed(2)}</span>
                )}
                {h.pnl_pct != null && (
                  <span className={`holding-pnl ${h.pnl_pct >= 0 ? "pos" : "neg"}`}>
                    {h.pnl_pct >= 0 ? "+" : ""}{h.pnl_pct}%
                  </span>
                )}
                <button className="btn-remove" onClick={() => remove(h.ticker)}>✕</button>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}
