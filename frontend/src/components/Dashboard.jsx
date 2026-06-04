import React, { useState, useEffect, useRef, useCallback } from 'react';
import api, { createPriceSocket } from '../services/api';
import RiskMetricsPanel from './RiskMetricsPanel';
import HoldingsTable from './HoldingsTable';
import PortfolioBuilder from './PortfolioBuilder';
import MonteCarloChart from './MonteCarloChart';
import CorrelationHeatmap from './CorrelationHeatmap';
import NewsPanel from './NewsPanel';
import RiskHistory from './RiskHistory';
import ExportPanel from './ExportPanel';

const TABS = [
  { id: 'overview',    icon: '📊', label: 'Overview' },
  { id: 'builder',     icon: '🔧', label: 'Builder' },
  { id: 'history',     icon: '📈', label: 'History' },
  { id: 'news',        icon: '📰', label: 'News' },
  { id: 'montecarlo',  icon: '🎲', label: 'Monte Carlo' },
  { id: 'export',      icon: '💾', label: 'Export' },
];

function useClockTick() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function CreatePortfolioModal({ onConfirm, onCancel }) {
  const [name, setName] = useState('');
  const [benchmark, setBenchmark] = useState('SPY');
  const [currency, setCurrency] = useState('USD');

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onConfirm(name.trim(), benchmark, currency);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Create New Portfolio</div>
        <form onSubmit={submit}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Portfolio Name</label>
            <input
              className="form-input"
              placeholder="e.g. Growth Portfolio"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Benchmark</label>
              <select className="form-select" value={benchmark} onChange={(e) => setBenchmark(e.target.value)}>
                <option value="SPY">SPY (S&amp;P 500)</option>
                <option value="QQQ">QQQ (Nasdaq)</option>
                <option value="NIFTY50.NS">NIFTY 50</option>
                <option value="^DJI">Dow Jones</option>
                <option value="GLD">Gold (GLD)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Currency</label>
              <select className="form-select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD">USD ($)</option>
                <option value="INR">INR (₹)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="modal-cancel" onClick={onCancel}>Cancel</button>
            <button type="submit" className="modal-confirm" disabled={!name.trim()}>
              Create Portfolio
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Dashboard({ token, user, onLogout }) {
  const now = useClockTick();

  const [portfolios, setPortfolios]     = useState([]);
  const [activePortId, setActivePortId] = useState(null);
  const [activeTab, setActiveTab]       = useState('overview');
  const [riskData, setRiskData]         = useState(null);
  const [holdings, setHoldings]         = useState([]);
  const [livePrices, setLivePrices]     = useState({});
  const [wsStatus, setWsStatus]         = useState('disconnected');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading]           = useState(true);

  const wsRef = useRef(null);

  // ── Load portfolios ──────────────────────────────────────
  const loadPortfolios = useCallback(async () => {
    try {
      const data = await api.getPortfolios(token);
      setPortfolios(data);
      if (data.length > 0 && !activePortId) {
        setActivePortId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load portfolios:', err);
    } finally {
      setLoading(false);
    }
  }, [token, activePortId]);

  useEffect(() => { loadPortfolios(); }, [loadPortfolios]);

  // ── Load risk + holdings when portfolio changes ─────────
  useEffect(() => {
    if (!activePortId) { setRiskData(null); setHoldings([]); return; }

    setRiskData(null);
    setHoldings([]);

    const load = async () => {
      try {
        const [risk, hold] = await Promise.all([
          api.getRisk(token, activePortId),
          api.getHoldings(token, activePortId),
        ]);
        setRiskData(risk);
        setHoldings(hold);
      } catch (err) {
        console.error('Failed to load portfolio data:', err);
      }
    };
    load();
  }, [activePortId, token]);

  // ── WebSocket for live prices ────────────────────────────
  useEffect(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (!activePortId) return;

    setWsStatus('connecting');
    const socket = createPriceSocket(
      activePortId,
      token,
      (msg) => {
        if (msg.type === 'price_update') {
          setLivePrices((prev) => ({ ...prev, ...msg.prices }));
        }
        setWsStatus('connected');
      },
      () => setWsStatus('disconnected')
    );
    wsRef.current = socket;
    setWsStatus('connected');

    return () => {
      socket.close();
      setWsStatus('disconnected');
    };
  }, [activePortId, token]);

  // ── Create portfolio ─────────────────────────────────────
  const handleCreatePortfolio = async (name, benchmark, currency) => {
    try {
      const newPort = await api.createPortfolio(token, name, benchmark, currency);
      setPortfolios((prev) => [...prev, newPort]);
      setActivePortId(newPort.id);
      setShowCreateModal(false);
    } catch (err) {
      console.error('Failed to create portfolio:', err);
    }
  };

  // ── Delete portfolio ─────────────────────────────────────
  const handleDeletePortfolio = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this portfolio and all its holdings?')) return;
    try {
      await api.deletePortfolio(token, id);
      setPortfolios((prev) => prev.filter((p) => p.id !== id));
      if (activePortId === id) {
        const remaining = portfolios.filter((p) => p.id !== id);
        setActivePortId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      console.error('Failed to delete portfolio:', err);
    }
  };

  // ── Refresh holdings + risk after builder changes ────────
  const handleHoldingsChange = async () => {
    if (!activePortId) return;
    try {
      const [risk, hold] = await Promise.all([
        api.getRisk(token, activePortId),
        api.getHoldings(token, activePortId),
      ]);
      setRiskData(risk);
      setHoldings(hold);
    } catch (err) {
      console.error('Refresh failed:', err);
    }
  };

  const activePortfolio = portfolios.find((p) => p.id === activePortId);

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  const formattedTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });

  return (
    <div className="dash-root">
      {/* ── Topbar ── */}
      <header className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon">🛡️</div>
          <div className="topbar-logo-text">Risk<span>Monitor</span> Pro</div>
        </div>
        <div className="topbar-sep" />

        {/* Portfolio quick-select */}
        <div className="topbar-portfolio-select">
          <select
            value={activePortId || ''}
            onChange={(e) => setActivePortId(e.target.value || null)}
          >
            {portfolios.length === 0 && (
              <option value="">No portfolios yet</option>
            )}
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="topbar-spacer" />

        <div className={`live-badge ${wsStatus === 'connected' ? 'connected' : 'disconnected'}`}>
          <div className="live-dot" />
          {wsStatus === 'connected' ? 'LIVE' : wsStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
        </div>

        <div className="topbar-time">{formattedTime} UTC</div>

        <div className="topbar-avatar" title={user?.email}>
          {user?.picture ? (
            <img src={user.picture} alt={user.name} />
          ) : (
            initials
          )}
        </div>

        <button className="signout-btn" onClick={onLogout} title="Sign out">
          ⏻ Sign Out
        </button>
      </header>

      {/* ── Body ── */}
      <div className="dash-body">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-section-title">Portfolios</div>
            <button className="sidebar-create-btn" onClick={() => setShowCreateModal(true)}>
              ＋ New Portfolio
            </button>
            <div className="portfolio-list">
              {loading ? (
                <>
                  <div className="skeleton" style={{ height: 48, borderRadius: 8, marginBottom: 4 }} />
                  <div className="skeleton" style={{ height: 48, borderRadius: 8 }} />
                </>
              ) : portfolios.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', padding: '16px 0' }}>
                  Create your first portfolio ↑
                </div>
              ) : (
                portfolios.map((p) => (
                  <div
                    key={p.id}
                    className={`portfolio-item ${activePortId === p.id ? 'active' : ''}`}
                    onClick={() => setActivePortId(p.id)}
                  >
                    <div className="portfolio-item-icon">💼</div>
                    <div className="portfolio-item-info">
                      <div className="portfolio-item-name">{p.name}</div>
                      <div className="portfolio-item-meta">
                        {p.benchmark || 'SPY'} · {p.currency || 'USD'}
                      </div>
                    </div>
                    <button
                      className="portfolio-delete-btn"
                      onClick={(e) => handleDeletePortfolio(p.id, e)}
                      title="Delete portfolio"
                    >
                      🗑
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Nav */}
          <div className="sidebar-section" style={{ border: 'none', flex: 1, overflowY: 'auto' }}>
            <div className="sidebar-section-title" style={{ marginBottom: 4 }}>Navigation</div>
            <nav className="sidebar-nav">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="nav-icon">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* User info at bottom */}
          <div className="sidebar-section" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="topbar-avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                {user?.picture ? <img src={user.picture} alt="" /> : initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.name || 'User'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email || ''}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main Panel ── */}
        <main className="main-panel">
          {!activePortId ? (
            <div className="empty-state">
              <div className="empty-icon">📂</div>
              <div className="empty-title">No Portfolio Selected</div>
              <div className="empty-desc">
                Create a new portfolio to start tracking your risk metrics, holdings, and performance.
              </div>
              <button
                className="sidebar-create-btn"
                style={{ marginTop: 20, width: 'auto', padding: '10px 24px' }}
                onClick={() => setShowCreateModal(true)}
              >
                ＋ Create First Portfolio
              </button>
            </div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <>
                  <div className="panel-header">
                    <div>
                      <div className="panel-title">{activePortfolio?.name}</div>
                      <div className="panel-subtitle">
                        Overview · Benchmark: {activePortfolio?.benchmark || 'SPY'} · {activePortfolio?.currency || 'USD'}
                      </div>
                    </div>
                    <button className="refresh-btn" onClick={handleHoldingsChange}>
                      🔄 Refresh
                    </button>
                  </div>
                  <RiskMetricsPanel riskData={riskData} currency={activePortfolio?.currency} />
                  <HoldingsTable
                    holdings={holdings}
                    livePrices={livePrices}
                    token={token}
                    portfolioId={activePortId}
                    onHoldingRemoved={handleHoldingsChange}
                    currency={activePortfolio?.currency}
                  />
                  {riskData?.correlation && Object.keys(riskData.correlation).length > 1 && (
                    <CorrelationHeatmap matrix={riskData.correlation} />
                  )}
                </>
              )}

              {/* Builder Tab */}
              {activeTab === 'builder' && (
                <>
                  <div className="panel-header">
                    <div>
                      <div className="panel-title">Portfolio Builder</div>
                      <div className="panel-subtitle">Add and manage your holdings</div>
                    </div>
                  </div>
                  <PortfolioBuilder
                    token={token}
                    portfolioId={activePortId}
                    holdings={holdings}
                    livePrices={livePrices}
                    onHoldingsChange={handleHoldingsChange}
                    currency={activePortfolio?.currency}
                  />
                </>
              )}

              {/* History Tab */}
              {activeTab === 'history' && (
                <>
                  <div className="panel-header">
                    <div>
                      <div className="panel-title">Risk History</div>
                      <div className="panel-subtitle">Historical value and risk metrics over time</div>
                    </div>
                  </div>
                  <RiskHistory token={token} portfolioId={activePortId} currency={activePortfolio?.currency} />
                </>
              )}

              {/* News Tab */}
              {activeTab === 'news' && (
                <>
                  <div className="panel-header">
                    <div>
                      <div className="panel-title">News & Sentiment</div>
                      <div className="panel-subtitle">AI-powered news sentiment for your holdings</div>
                    </div>
                  </div>
                  <NewsPanel token={token} portfolioId={activePortId} />
                </>
              )}

              {/* Monte Carlo Tab */}
              {activeTab === 'montecarlo' && (
                <>
                  <div className="panel-header">
                    <div>
                      <div className="panel-title">Monte Carlo Simulation</div>
                      <div className="panel-subtitle">90-day probabilistic portfolio outlook</div>
                    </div>
                  </div>
                  <MonteCarloChart
                    monteCarloData={riskData?.monte_carlo}
                    currentValue={riskData?.portfolio_value}
                    currency={activePortfolio?.currency}
                  />
                </>
              )}

              {/* Export Tab */}
              {activeTab === 'export' && (
                <>
                  <div className="panel-header">
                    <div>
                      <div className="panel-title">Export Reports</div>
                      <div className="panel-subtitle">Download your portfolio data and risk reports</div>
                    </div>
                  </div>
                  <ExportPanel token={token} portfolioId={activePortId} portfolioName={activePortfolio?.name} />
                </>
              )}
            </>
          )}
        </main>
      </div>

      {/* Create Portfolio Modal */}
      {showCreateModal && (
        <CreatePortfolioModal
          onConfirm={handleCreatePortfolio}
          onCancel={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
