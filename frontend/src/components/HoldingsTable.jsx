import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';

const SORT_DIRS = { asc: 'asc', desc: 'desc' };

function formatCurrency(val, currency = 'USD') {
  if (val == null || isNaN(val)) return '—';
  const symbols = { USD: '$', INR: '₹', EUR: '€', GBP: '£' };
  const sym = symbols[currency] || '$';
  return `${sym}${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function AssetBadge({ type }) {
  const t = (type || 'stock').toLowerCase();
  return <span className={`asset-badge ${t}`}>{t}</span>;
}

function PriceCell({ symbol, price }) {
  const [flashClass, setFlashClass] = useState('');
  const prevRef = useRef(price);

  useEffect(() => {
    if (prevRef.current == null) { prevRef.current = price; return; }
    if (price !== prevRef.current) {
      const dir = price > prevRef.current ? 'flash-up' : 'flash-down';
      setFlashClass(dir);
      prevRef.current = price;
      const timer = setTimeout(() => setFlashClass(''), 650);
      return () => clearTimeout(timer);
    }
  }, [price]);

  if (price == null) return <td className="holdings-table td mono" style={{ color: 'var(--text-faint)' }}>—</td>;

  return (
    <td>
      <span className={`price-cell ${flashClass}`}>
        {Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
      </span>
    </td>
  );
}

export default function HoldingsTable({ holdings = [], livePrices = {}, token, portfolioId, onHoldingRemoved, currency = 'USD' }) {
  const [sortKey, setSortKey] = useState('symbol');
  const [sortDir, setSortDir] = useState('asc');
  const [removing, setRemoving] = useState(null);

  const totalValue = holdings.reduce((sum, h) => {
    const price = livePrices[h.symbol] ?? h.current_price ?? h.avg_cost;
    return sum + (h.shares || 0) * (price || 0);
  }, 0);

  const handleSort = useCallback((key) => {
    setSortDir((prev) => (sortKey === key ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
    setSortKey(key);
  }, [sortKey]);

  const handleRemove = async (symbol) => {
    if (!window.confirm(`Remove ${symbol} from this portfolio?`)) return;
    setRemoving(symbol);
    try {
      await api.removeHolding(token, portfolioId, symbol);
      if (onHoldingRemoved) await onHoldingRemoved();
    } catch (err) {
      console.error('Remove failed:', err);
    } finally {
      setRemoving(null);
    }
  };

  const enriched = holdings.map((h) => {
    const livePrice = livePrices[h.symbol] ?? h.current_price;
    const price = livePrice ?? h.avg_cost;
    const marketValue = h.shares * price;
    const pnlDollar = h.shares * (price - h.avg_cost);
    const pnlPct = h.avg_cost ? (price - h.avg_cost) / h.avg_cost : 0;
    const weight = totalValue > 0 ? marketValue / totalValue : 0;
    return { ...h, livePrice, price, marketValue, pnlDollar, pnlPct, weight };
  });

  const sorted = [...enriched].sort((a, b) => {
    let va = a[sortKey], vb = b[sortKey];
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const sortIcon = (key) => {
    if (sortKey !== key) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const headers = [
    { key: 'symbol',      label: 'Symbol' },
    { key: 'asset_type',  label: 'Type' },
    { key: 'shares',      label: 'Shares' },
    { key: 'avg_cost',    label: 'Avg Cost' },
    { key: 'livePrice',   label: 'Live Price' },
    { key: 'marketValue', label: 'Mkt Value' },
    { key: 'weight',      label: 'Weight' },
    { key: 'pnlPct',      label: 'P&L %' },
    { key: 'pnlDollar',   label: 'P&L $' },
    { key: null,          label: 'Action' },
  ];

  return (
    <div className="table-wrap">
      <div className="table-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="table-title">Holdings</span>
          <span className="table-count">{holdings.length}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Total: {formatCurrency(totalValue, currency)}
        </div>
      </div>

      {holdings.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <div className="empty-title">No Holdings Yet</div>
          <div className="empty-desc">Go to the Builder tab to add stocks, crypto, ETFs, and more.</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="holdings-table">
            <thead>
              <tr>
                {headers.map((h) => (
                  <th
                    key={h.label}
                    className={sortKey === h.key ? 'sorted' : ''}
                    onClick={() => h.key && handleSort(h.key)}
                    style={!h.key ? { cursor: 'default' } : {}}
                  >
                    {h.label}
                    {h.key && sortIcon(h.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((h) => {
                const pnlPos = h.pnlDollar >= 0;
                return (
                  <tr key={h.symbol}>
                    {/* Symbol */}
                    <td>
                      <div className="symbol-cell">
                        <div className="symbol-avatar">
                          {h.symbol.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="symbol-name">{h.symbol}</div>
                        </div>
                      </div>
                    </td>
                    {/* Asset type */}
                    <td><AssetBadge type={h.asset_type} /></td>
                    {/* Shares */}
                    <td className="mono">{Number(h.shares).toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
                    {/* Avg Cost */}
                    <td className="mono">{formatCurrency(h.avg_cost, currency)}</td>
                    {/* Live Price */}
                    <PriceCell symbol={h.symbol} price={h.livePrice} />
                    {/* Market Value */}
                    <td className="mono">{formatCurrency(h.marketValue, currency)}</td>
                    {/* Weight */}
                    <td>
                      <div className="weight-bar-wrap">
                        <div className="weight-bar">
                          <div
                            className="weight-bar-fill"
                            style={{ width: `${Math.min(h.weight * 100, 100)}%` }}
                          />
                        </div>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', minWidth: 36 }}>
                          {(h.weight * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    {/* P&L % */}
                    <td>
                      <span className={pnlPos ? 'pnl-positive' : 'pnl-negative'}>
                        {pnlPos ? '▲' : '▼'} {Math.abs(h.pnlPct * 100).toFixed(2)}%
                      </span>
                    </td>
                    {/* P&L $ */}
                    <td>
                      <span className={pnlPos ? 'pnl-positive' : 'pnl-negative'}>
                        {pnlPos ? '+' : ''}{formatCurrency(h.pnlDollar, currency)}
                      </span>
                    </td>
                    {/* Remove */}
                    <td>
                      <button
                        className="remove-btn"
                        onClick={() => handleRemove(h.symbol)}
                        disabled={removing === h.symbol}
                        title={`Remove ${h.symbol}`}
                      >
                        {removing === h.symbol ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '🗑'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
