import React, { useState, useRef, useEffect } from 'react';
import api from '../services/api';
import HoldingsTable from './HoldingsTable';

const ASSET_TYPES = ['stock', 'crypto', 'etf', 'forex', 'bond'];

const POPULAR_TICKERS = [
  { symbol: 'AAPL',        type: 'stock' },
  { symbol: 'TSLA',        type: 'stock' },
  { symbol: 'NVDA',        type: 'stock' },
  { symbol: 'MSFT',        type: 'stock' },
  { symbol: 'GOOGL',       type: 'stock' },
  { symbol: 'AMZN',        type: 'stock' },
  { symbol: 'BTC-USD',     type: 'crypto' },
  { symbol: 'ETH-USD',     type: 'crypto' },
  { symbol: 'SPY',         type: 'etf' },
  { symbol: 'QQQ',         type: 'etf' },
  { symbol: 'RELIANCE.NS', type: 'stock' },
  { symbol: 'TCS.NS',      type: 'stock' },
];

const AUTOCOMPLETE_POOL = [
  'AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'BRK-B',
  'JPM', 'V', 'JNJ', 'UNH', 'XOM', 'MA', 'LLY', 'HD', 'CVX', 'PG',
  'ABBV', 'MRK', 'COST', 'AVGO', 'KO', 'PEP', 'AMD', 'INTC',
  'BTC-USD', 'ETH-USD', 'BNB-USD', 'SOL-USD', 'ADA-USD', 'DOGE-USD',
  'SPY', 'QQQ', 'IWM', 'VTI', 'GLD', 'SLV', 'TLT', 'HYG',
  'RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'ICICIBANK.NS',
  'WIPRO.NS', 'HINDUNILVR.NS', 'BAJFINANCE.NS',
];

export default function PortfolioBuilder({ token, portfolioId, holdings = [], livePrices = {}, onHoldingsChange, currency = 'USD' }) {
  const [symbol, setSymbol]     = useState('');
  const [assetType, setAssetType] = useState('stock');
  const [shares, setShares]     = useState('');
  const [avgCost, setAvgCost]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const suggRef = useRef(null);

  // Autocomplete
  useEffect(() => {
    if (!symbol.trim()) { setSuggestions([]); return; }
    const q = symbol.toUpperCase();
    setSuggestions(AUTOCOMPLETE_POOL.filter((s) => s.startsWith(q)).slice(0, 6));
  }, [symbol]);

  // Click outside to close suggestions
  useEffect(() => {
    const handler = (e) => {
      if (suggRef.current && !suggRef.current.contains(e.target)) setShowSugg(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const validate = () => {
    if (!symbol.trim()) return 'Symbol is required';
    if (!shares || isNaN(parseFloat(shares)) || parseFloat(shares) <= 0) return 'Shares must be a positive number';
    if (!avgCost || isNaN(parseFloat(avgCost)) || parseFloat(avgCost) <= 0) return 'Average cost must be a positive number';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await api.addHolding(token, portfolioId, symbol.trim().toUpperCase(), assetType, shares, avgCost);
      setSuccess(`✓ ${symbol.toUpperCase()} added successfully`);
      setSymbol('');
      setShares('');
      setAvgCost('');
      setAssetType('stock');
      setSuggestions([]);
      if (onHoldingsChange) await onHoldingsChange();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to add holding. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const applyChip = (ticker) => {
    setSymbol(ticker.symbol);
    setAssetType(ticker.type);
    setSuggestions([]);
    setShowSugg(false);
  };

  const applySuggestion = (s) => {
    setSymbol(s);
    setShowSugg(false);
    setSuggestions([]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Form card */}
      <div className="builder-card">
        <div style={{ marginBottom: 16 }}>
          <div className="table-title">Add Holding</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Enter a ticker symbol with shares and cost to track your position.
          </div>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="builder-form">
            {/* Symbol with autocomplete */}
            <div className="form-group" ref={suggRef} style={{ position: 'relative' }}>
              <label className="form-label">Symbol</label>
              <input
                className="form-input"
                placeholder="e.g. AAPL, BTC-USD"
                value={symbol}
                onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setShowSugg(true); }}
                onFocus={() => setShowSugg(true)}
                autoComplete="off"
                spellCheck={false}
              />
              {showSugg && suggestions.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0, right: 0,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius)',
                  zIndex: 50,
                  marginTop: 2,
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow)',
                }}>
                  {suggestions.map((s) => (
                    <div
                      key={s}
                      style={{
                        padding: '9px 12px',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                        color: 'var(--text-primary)',
                        transition: 'background 0.15s',
                      }}
                      onMouseDown={() => applySuggestion(s)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-3)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Asset type */}
            <div className="form-group">
              <label className="form-label">Asset Type</label>
              <select
                className="form-select"
                value={assetType}
                onChange={(e) => setAssetType(e.target.value)}
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>

            {/* Shares */}
            <div className="form-group">
              <label className="form-label">Shares / Units</label>
              <input
                className="form-input"
                type="number"
                placeholder="e.g. 10"
                min="0.00000001"
                step="any"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
              />
            </div>

            {/* Avg cost */}
            <div className="form-group">
              <label className="form-label">Avg Cost ({currency})</label>
              <input
                className="form-input"
                type="number"
                placeholder="e.g. 150.00"
                min="0.00000001"
                step="any"
                value={avgCost}
                onChange={(e) => setAvgCost(e.target.value)}
              />
            </div>

            {/* Submit */}
            <div className="form-group" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? (
                  <>
                    <span className="spinner" style={{ marginRight: 6 }} />
                    Adding…
                  </>
                ) : (
                  '＋ Add Holding'
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Error / Success */}
        {error && <div className="builder-error">{error}</div>}
        {success && <div className="builder-success">{success}</div>}

        {/* Quick add chips */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-faint)', marginBottom: 10 }}>
            Quick Add
          </div>
          <div className="quick-chips">
            {POPULAR_TICKERS.map((t) => (
              <button
                key={t.symbol}
                className="quick-chip"
                type="button"
                onClick={() => applyChip(t)}
                title={`Add ${t.symbol} (${t.type})`}
              >
                {t.symbol}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Holdings preview */}
      <HoldingsTable
        holdings={holdings}
        livePrices={livePrices}
        token={token}
        portfolioId={portfolioId}
        onHoldingRemoved={onHoldingsChange}
        currency={currency}
      />
    </div>
  );
}
