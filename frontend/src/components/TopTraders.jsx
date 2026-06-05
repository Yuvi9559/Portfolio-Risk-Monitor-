import React, { useState, useEffect } from 'react';
import api from '../services/api';

/* ── helpers ─────────────────────────────────────────────────── */
function fmtValue(v) {
  if (v == null) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtShares(s) {
  if (s == null) return '—';
  const abs = Math.abs(s);
  if (abs >= 1e9) return `${(s / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(s / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(s / 1e3).toFixed(1)}K`;
  return s.toLocaleString();
}

const STRATEGY_COLORS = {
  'Value Investing': { bg: '#2196f3', cls: 'value' },
  'Global Macro': { bg: '#9c27b0', cls: 'macro' },
  'Contrarian Value': { bg: '#ff9800', cls: 'contrarian' },
  'Disruptive Innovation': { bg: '#00d4ff', cls: 'innovation' },
  'Activist Investing': { bg: '#ff1744', cls: 'activist' },
  'Event-Driven': { bg: '#ffc107', cls: 'event' },
  'Deep Value': { bg: '#009688', cls: 'deep-value' },
};

const SECTOR_COLORS = {
  Technology: '#00d4ff',
  Financial: '#ffc107',
  'Consumer Staples': '#69f0ae',
  Energy: '#ff9800',
  Healthcare: '#e040fb',
  'Consumer Discretionary': '#ff5252',
  ETF: '#64b5f6',
  Commodity: '#ffb74d',
  Communication: '#ab47bc',
  Industrials: '#78909c',
  Other: '#616161',
};

function getStrategyInfo(strategy) {
  return STRATEGY_COLORS[strategy] || { bg: '#616161', cls: 'value' };
}

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

/* ── Trader Card (grid view) ─────────────────────────────────── */
function TraderCard({ trader, onClick }) {
  const info = getStrategyInfo(trader.strategy);
  const buys = (trader.top_holdings || []).filter(h =>
    h.change_type === 'BUY' || h.change_type === 'NEW'
  ).length;
  const sells = (trader.top_holdings || []).filter(h =>
    h.change_type === 'SELL' || h.change_type === 'EXIT'
  ).length;

  return (
    <div className="tt-card" onClick={() => onClick(trader.id)}>
      <div className="tt-card-header">
        <div className="tt-avatar" style={{ background: info.bg }}>
          {getInitials(trader.name)}
        </div>
        <div>
          <div className="tt-name">{trader.name}</div>
          <div className="tt-firm">{trader.firm}</div>
        </div>
      </div>

      <span className={`tt-badge ${info.cls}`}>{trader.strategy}</span>

      <div className="tt-value">{fmtValue(trader.portfolio_value)}</div>
      <div className="tt-quarter">
        {trader.quarter} · {trader.total_holdings} holdings
      </div>

      <div className="tt-top-holdings">
        {(trader.top_holdings || []).slice(0, 3).map(h => (
          <div className="tt-holding-row" key={h.symbol}>
            <span className="tt-holding-symbol">{h.symbol}</span>
            <div className="tt-holding-bar">
              <div
                className="tt-holding-bar-fill"
                style={{ width: `${Math.min(h.pct_portfolio * 2, 100)}%` }}
              />
            </div>
            <span className="tt-holding-pct">{h.pct_portfolio.toFixed(1)}%</span>
          </div>
        ))}
      </div>

      <div className="tt-activity">
        {buys > 0 && (
          <span className="tt-activity-buy">
            ▲ <span className="tt-activity-count">{buys}</span> buy{buys > 1 ? 's' : ''}
          </span>
        )}
        {sells > 0 && (
          <span className="tt-activity-sell">
            ▼ <span className="tt-activity-count">{sells}</span> sell{sells > 1 ? 's' : ''}
          </span>
        )}
        {buys === 0 && sells === 0 && (
          <span style={{ color: 'var(--text-faint)' }}>No recent changes</span>
        )}
      </div>
    </div>
  );
}

/* ── Sector Allocation Bar ───────────────────────────────────── */
function SectorBar({ allocation }) {
  const entries = Object.entries(allocation);
  if (entries.length === 0) return null;

  return (
    <div className="tt-sector-bar-container">
      <div className="tt-section-title">📊 Sector Allocation</div>
      <div className="tt-sector-bar">
        {entries.map(([sector, pct]) => (
          <div
            key={sector}
            className="tt-sector-segment"
            style={{
              flex: pct,
              background: SECTOR_COLORS[sector] || '#616161',
            }}
            title={`${sector}: ${pct.toFixed(1)}%`}
          >
            {pct > 8 ? `${pct.toFixed(0)}%` : ''}
          </div>
        ))}
      </div>
      <div className="tt-sector-legend">
        {entries.map(([sector, pct]) => (
          <div className="tt-sector-legend-item" key={sector}>
            <div
              className="tt-sector-dot"
              style={{ background: SECTOR_COLORS[sector] || '#616161' }}
            />
            {sector} ({pct.toFixed(1)}%)
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Trader Detail View ──────────────────────────────────────── */
function TraderDetail({ detail, news, onBack, loading }) {
  if (loading) {
    return (
      <div className="tt-detail">
        <button className="tt-back-btn" onClick={onBack}>← Back to traders</button>
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-faint)' }}>
          <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
        </div>
      </div>
    );
  }

  if (!detail) return null;

  const { trader, holdings, recent_buys, recent_sells, sector_allocation } = detail;
  const info = getStrategyInfo(trader.strategy);

  return (
    <div className="tt-detail">
      <button className="tt-back-btn" onClick={onBack}>← Back to all traders</button>

      {/* Header */}
      <div className="tt-detail-header">
        <div className="tt-detail-avatar" style={{ background: info.bg }}>
          {getInitials(trader.name)}
        </div>
        <div>
          <div className="tt-detail-name">{trader.name}</div>
          <div className="tt-detail-firm">{trader.firm}</div>
          <span className={`tt-badge ${info.cls}`} style={{ marginTop: 6 }}>{trader.strategy}</span>
          <div className="tt-detail-bio">{trader.bio}</div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="tt-stats-row">
        <div className="tt-stat-card">
          <div className="tt-stat-value">{fmtValue(trader.portfolio_value)}</div>
          <div className="tt-stat-label">Portfolio Value</div>
        </div>
        <div className="tt-stat-card">
          <div className="tt-stat-value">{trader.total_holdings}</div>
          <div className="tt-stat-label">Holdings</div>
        </div>
        <div className="tt-stat-card">
          <div className="tt-stat-value" style={{ color: '#00c853' }}>{recent_buys.length}</div>
          <div className="tt-stat-label">Recent Buys</div>
        </div>
        <div className="tt-stat-card">
          <div className="tt-stat-value" style={{ color: '#ff1744' }}>{recent_sells.length}</div>
          <div className="tt-stat-label">Recent Sells</div>
        </div>
        <div className="tt-stat-card">
          <div className="tt-stat-value">{trader.quarter}</div>
          <div className="tt-stat-label">Filing Period</div>
        </div>
      </div>

      {/* Sector Allocation */}
      <SectorBar allocation={sector_allocation} />

      {/* Holdings Table */}
      <div className="tt-section-title">💼 Full Holdings</div>
      <div style={{ overflowX: 'auto', marginBottom: 24 }}>
        <table className="tt-holdings-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Company</th>
              <th>Shares</th>
              <th>Value</th>
              <th>% Portfolio</th>
              <th>Change</th>
              <th>Sector</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map(h => (
              <tr key={h.symbol}>
                <td className="symbol-cell">{h.symbol}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{h.company_name}</td>
                <td>{fmtShares(h.shares)}</td>
                <td>{fmtValue(h.value)}</td>
                <td>{h.pct_portfolio.toFixed(1)}%</td>
                <td>
                  <span className={`tt-change-badge ${h.change_type.toLowerCase()}`}>
                    {h.change_type}
                    {h.change_type !== 'HOLD' && h.change_pct !== 0 && (
                      <> ({h.change_pct > 0 ? '+' : ''}{h.change_pct.toFixed(1)}%)</>
                    )}
                  </span>
                </td>
                <td style={{ color: 'var(--text-faint)', fontSize: 12 }}>{h.sector}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent Buys */}
      {recent_buys.length > 0 && (
        <>
          <div className="tt-section-title" style={{ color: '#00c853' }}>▲ Recent Buys</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 24 }}>
            {recent_buys.map(h => (
              <div key={h.symbol} className="tt-stat-card" style={{ borderColor: 'rgba(0,200,83,0.2)' }}>
                <div className="tt-stat-value" style={{ color: '#00c853', fontSize: 16 }}>{h.symbol}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{h.company_name}</div>
                <div style={{ fontSize: 13, color: '#69f0ae', marginTop: 4 }}>
                  +{fmtShares(Math.abs(h.change_shares))} shares
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Recent Sells */}
      {recent_sells.length > 0 && (
        <>
          <div className="tt-section-title" style={{ color: '#ff1744' }}>▼ Recent Sells</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 24 }}>
            {recent_sells.map(h => (
              <div key={h.symbol} className="tt-stat-card" style={{ borderColor: 'rgba(255,23,68,0.2)' }}>
                <div className="tt-stat-value" style={{ color: '#ff1744', fontSize: 16 }}>{h.symbol}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{h.company_name}</div>
                <div style={{ fontSize: 13, color: '#ff5252', marginTop: 4 }}>
                  {fmtShares(h.change_shares)} shares ({h.change_pct.toFixed(1)}%)
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* News */}
      {news.length > 0 && (
        <>
          <div className="tt-section-title">📰 Latest News</div>
          {news.map((item, i) => (
            <div className="tt-news-item" key={i}>
              <div className="tt-news-headline">
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  {item.headline}
                </a>
              </div>
              <div className="tt-news-meta">
                <span>{item.symbol}</span>
                <span>{item.source || 'Google News'}</span>
                <span className={`tt-sentiment-badge ${item.sentiment_label}`}>
                  {item.sentiment_label} ({item.sentiment_score > 0 ? '+' : ''}
                  {item.sentiment_score?.toFixed(2)})
                </span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────── */
export default function TopTraders({ token }) {
  const [traders, setTraders] = useState([]);
  const [selectedTrader, setSelectedTrader] = useState(null);
  const [traderDetail, setTraderDetail] = useState(null);
  const [traderNews, setTraderNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getTraders(token);
        setTraders(data);
      } catch (err) {
        console.error('Failed to load traders:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const selectTrader = async (traderId) => {
    setSelectedTrader(traderId);
    setDetailLoading(true);
    try {
      const [detail, news] = await Promise.all([
        api.getTraderDetail(token, traderId),
        api.getTraderNews(token, traderId),
      ]);
      setTraderDetail(detail);
      setTraderNews(news);
    } catch (err) {
      console.error('Failed to load trader detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const goBack = () => {
    setSelectedTrader(null);
    setTraderDetail(null);
    setTraderNews([]);
  };

  if (loading) {
    return (
      <div className="tt-skeleton-grid">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="tt-skeleton-card">
            <div className="skeleton" style={{ height: 44, width: 44, borderRadius: '50%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 12, width: '40%', marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 28, width: '50%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 8, width: '100%', marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 8, width: '80%', marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 8, width: '60%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (selectedTrader) {
    return (
      <TraderDetail
        detail={traderDetail}
        news={traderNews}
        onBack={goBack}
        loading={detailLoading}
      />
    );
  }

  return (
    <div className="tt-grid">
      {traders.map(t => (
        <TraderCard key={t.id} trader={t} onClick={selectTrader} />
      ))}
    </div>
  );
}
