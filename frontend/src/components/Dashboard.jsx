import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import api, { createPriceSocket } from '../services/api';
import RiskMetricsPanel from './RiskMetricsPanel';
import HoldingsTable from './HoldingsTable';

const PortfolioBuilder = lazy(() => import('./PortfolioBuilder'));
const MonteCarloChart = lazy(() => import('./MonteCarloChart'));
const CorrelationHeatmap = lazy(() => import('./CorrelationHeatmap'));
const NewsPanel = lazy(() => import('./NewsPanel'));
const RiskHistory = lazy(() => import('./RiskHistory'));
const ExportPanel = lazy(() => import('./ExportPanel'));
const TopTraders = lazy(() => import('./TopTraders'));

const TABS = [
  { id: 'overview',    icon: '📊', label: 'Overview' },
  { id: 'builder',     icon: '🔧', label: 'Builder' },
  { id: 'history',     icon: '📈', label: 'History' },
  { id: 'news',        icon: '📰', label: 'News' },
  { id: 'montecarlo',  icon: '🎲', label: 'Monte Carlo' },
  { id: 'traders',     icon: '🏆', label: 'Top Traders' },
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
                <option value="^NSEI">NIFTY 50</option>
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

function UploadPortfolioModal({ onConfirm, onCancel }) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [parsedHoldings, setParsedHoldings] = useState([]);
  const [error, setError] = useState('');

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = (selectedFile) => {
    if (!selectedFile.name.endsWith('.csv')) {
      setError('Only CSV files are supported at this time.');
      setFile(null);
      setParsedHoldings([]);
      return;
    }
    setError('');
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) {
          throw new Error('CSV file is empty or has no header row.');
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const symIdx = headers.findIndex(h => h.includes('symbol') || h.includes('ticker') || h.includes('asset'));
        const sharesIdx = headers.findIndex(h => h.includes('shares') || h.includes('qty') || h.includes('quantity'));
        const costIdx = headers.findIndex(h => h.includes('cost') || h.includes('price') || h.includes('avg'));

        if (symIdx === -1 || sharesIdx === -1) {
          throw new Error('CSV headers must include "symbol" and "shares" columns.');
        }

        const holdings = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
          if (cols.length <= Math.max(symIdx, sharesIdx)) continue;

          const symbol = cols[symIdx].toUpperCase();
          const shares = parseFloat(cols[sharesIdx]);
          const avg_cost = costIdx !== -1 ? parseFloat(cols[costIdx]) : null;

          if (!symbol || isNaN(shares) || shares <= 0) {
            continue;
          }

          let asset_type = 'stock';
          if (symbol.endsWith('-USD') || ['BTC', 'ETH', 'SOL', 'ADA', 'XRP'].includes(symbol)) {
            asset_type = 'crypto';
          }

          holdings.push({ symbol, shares, avg_cost: isNaN(avg_cost) ? null : avg_cost, asset_type });
        }

        if (holdings.length === 0) {
          throw new Error('No valid holdings parsed from CSV.');
        }

        setParsedHoldings(holdings);
      } catch (err) {
        console.error(err);
        setError(err.message || 'Failed to parse file.');
        setFile(null);
        setParsedHoldings([]);
      }
    };
    reader.readAsText(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (parsedHoldings.length === 0 || !file) return;
    const portfolioName = file.name.replace(/\.[^/.]+$/, "");
    onConfirm(portfolioName, parsedHoldings);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-title">📁 Upload Portfolio</div>
        <form onSubmit={handleSubmit}>
          
          <div 
            className={`drag-drop-zone ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
          >
            <input 
              type="file" 
              id="file-upload-input" 
              className="file-upload-input" 
              accept=".csv"
              onChange={handleChange}
            />
            <label htmlFor="file-upload-input" className="file-upload-label">
              <div className="file-upload-icon">{file ? '📄' : '📥'}</div>
              <div className="file-upload-text">
                {file ? (
                  <strong>{file.name}</strong>
                ) : (
                  <span>Drag and drop your portfolio CSV file, or <strong>browse files</strong></span>
                )}
              </div>
              <span className="file-upload-subtext">CSV must contain columns: symbol, shares, avg_cost (optional)</span>
            </label>
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10, textAlign: 'center', fontWeight: 500 }}>
              ⚠️ {error}
            </div>
          )}

          {parsedHoldings.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>Parsed Preview</span>
                <span>{parsedHoldings.length} symbols found</span>
              </div>
              <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>Symbol</th>
                      <th style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>Shares</th>
                      <th style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>Avg Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedHoldings.map((h, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent)' }}>{h.symbol}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{h.shares}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>{h.avg_cost != null ? `$${h.avg_cost.toFixed(2)}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="modal-cancel" onClick={onCancel}>Cancel</button>
            <button type="submit" className="modal-confirm" disabled={parsedHoldings.length === 0}>
              Confirm Import
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
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [loading, setLoading]           = useState(true);

  const wsRef = useRef(null);

  // ── Load portfolios ──────────────────────────────────────
  const loadPortfolios = useCallback(async () => {
    try {
      const data = await api.getPortfolios(token);
      setPortfolios(data);
      setActivePortId(prev => {
        if (data.length > 0 && !prev) {
          return data[0].id;
        }
        return prev;
      });
    } catch (err) {
      console.error('Failed to load portfolios:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadPortfolios(); }, [loadPortfolios]);

  // ── Load risk + holdings when portfolio changes ─────────
  useEffect(() => {
    if (!activePortId) { setRiskData(null); setHoldings([]); return; }

    setRiskData(null);
    setHoldings([]);

    const load = async () => {
      try {
        const hold = await api.getHoldings(token, activePortId);
        setHoldings(hold);
        if (hold && hold.length > 0) {
          try {
            const risk = await api.getRisk(token, activePortId);
            setRiskData(risk);
          } catch (riskErr) {
            console.error('Failed to load risk data:', riskErr);
            setRiskData({ isEmpty: true });
          }
        } else {
          setRiskData({ isEmpty: true });
        }
      } catch (err) {
        console.error('Failed to load portfolio data:', err);
        setRiskData({ isEmpty: true });
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

  const handleCreateDemoPortfolio = async () => {
    try {
      setLoading(true);
      const demoPort = await api.createPortfolio(token, "Demo Portfolio", "SPY", "USD");
      
      const sampleHoldings = [
        { symbol: 'AAPL', asset_type: 'stock', shares: 150, avg_cost: 175.50 },
        { symbol: 'MSFT', asset_type: 'stock', shares: 80, avg_cost: 380.20 },
        { symbol: 'TSLA', asset_type: 'stock', shares: 50, avg_cost: 210.00 },
        { symbol: 'BTC-USD', asset_type: 'crypto', shares: 0.75, avg_cost: 42500.00 },
        { symbol: 'SPY', asset_type: 'etf', shares: 40, avg_cost: 490.10 }
      ];
      
      for (const h of sampleHoldings) {
        await api.addHolding(token, demoPort.id, h.symbol, h.asset_type, h.shares, h.avg_cost);
      }

      const data = await api.getPortfolios(token);
      setPortfolios(data);
      setActivePortId(demoPort.id);
      
      const hold = await api.getHoldings(token, demoPort.id);
      setHoldings(hold);
      
      const risk = await api.getRisk(token, demoPort.id);
      setRiskData(risk);
    } catch (err) {
      console.error('Failed to create demo portfolio:', err);
      alert('Error creating demo portfolio: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadPortfolio = async (name, parsedHoldings) => {
    try {
      setLoading(true);
      setShowUploadModal(false);
      
      const newPort = await api.createPortfolio(token, name, "SPY", "USD");
      
      for (const h of parsedHoldings) {
        await api.addHolding(token, newPort.id, h.symbol, h.asset_type, h.shares, h.avg_cost);
      }

      const data = await api.getPortfolios(token);
      setPortfolios(data);
      setActivePortId(newPort.id);
      
      const hold = await api.getHoldings(token, newPort.id);
      setHoldings(hold);
      
      const risk = await api.getRisk(token, newPort.id);
      setRiskData(risk);
    } catch (err) {
      console.error('Failed to import portfolio:', err);
      alert('Failed to import portfolio: ' + err.message);
    } finally {
      setLoading(false);
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
      const hold = await api.getHoldings(token, activePortId);
      setHoldings(hold);
      if (hold && hold.length > 0) {
        try {
          const risk = await api.getRisk(token, activePortId);
          setRiskData(risk);
        } catch (riskErr) {
          console.error('Refresh risk failed:', riskErr);
          setRiskData({ isEmpty: true });
        }
      } else {
        setRiskData({ isEmpty: true });
      }
    } catch (err) {
      console.error('Refresh failed:', err);
      setRiskData({ isEmpty: true });
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
              <button className="sidebar-demo-btn" onClick={handleCreateDemoPortfolio} style={{ width: '100%', padding: '8px 6px', background: 'transparent', border: '1px dashed var(--accent-color)', color: 'var(--accent-color)', borderRadius: 8, fontSize: 11, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                🤖 Demo Mode
              </button>
              <button className="sidebar-demo-btn" onClick={() => setShowUploadModal(true)} style={{ width: '100%', padding: '8px 6px', background: 'transparent', border: '1px dashed var(--accent-color)', color: 'var(--accent-color)', borderRadius: 8, fontSize: 11, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                📁 Upload Port
              </button>
            </div>
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
          {/* Top Traders tab — always accessible, no portfolio needed */}
          {activeTab === 'traders' ? (
            <>
              <div className="panel-header">
                <div>
                  <div className="panel-title">Top Traders</div>
                  <div className="panel-subtitle">Learn from the world's most successful investors — SEC 13F filings</div>
                </div>
              </div>
              <Suspense fallback={<div className="skeleton" style={{ height: 400, borderRadius: 12 }} />}>
                <TopTraders token={token} />
              </Suspense>
            </>
          ) : !activePortId ? (
            <div className="empty-state">
              <div className="empty-icon">📂</div>
              <div className="empty-title">No Portfolio Selected</div>
              <div className="empty-desc">
                Create a new portfolio to start tracking your risk metrics, holdings, and performance.
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  className="sidebar-create-btn"
                  style={{ width: 'auto', padding: '10px 24px' }}
                  onClick={() => setShowCreateModal(true)}
                >
                  ＋ Create First Portfolio
                </button>
                <button
                  className="sidebar-demo-btn"
                  style={{ width: 'auto', padding: '10px 24px', background: 'transparent', border: '1px dashed var(--accent-color)', color: 'var(--accent-color)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={handleCreateDemoPortfolio}
                >
                  🤖 Create Demo Portfolio
                </button>
                <button
                  className="sidebar-demo-btn"
                  style={{ width: 'auto', padding: '10px 24px', background: 'transparent', border: '1px dashed var(--accent-color)', color: 'var(--accent-color)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => setShowUploadModal(true)}
                >
                  📁 Upload Portfolio
                </button>
              </div>
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
                    <Suspense fallback={<div className="skeleton" style={{ height: 250, borderRadius: 12, marginTop: 16 }} />}>
                      <CorrelationHeatmap matrix={riskData.correlation} />
                    </Suspense>
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
                  <Suspense fallback={<div className="skeleton" style={{ height: 400, borderRadius: 12 }} />}>
                    <PortfolioBuilder
                      token={token}
                      portfolioId={activePortId}
                      holdings={holdings}
                      livePrices={livePrices}
                      onHoldingsChange={handleHoldingsChange}
                      currency={activePortfolio?.currency}
                    />
                  </Suspense>
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
                  <Suspense fallback={<div className="skeleton" style={{ height: 350, borderRadius: 12 }} />}>
                    <RiskHistory token={token} portfolioId={activePortId} currency={activePortfolio?.currency} />
                  </Suspense>
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
                  <Suspense fallback={<div className="skeleton" style={{ height: 350, borderRadius: 12 }} />}>
                    <NewsPanel token={token} portfolioId={activePortId} />
                  </Suspense>
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
                  <Suspense fallback={<div className="skeleton" style={{ height: 400, borderRadius: 12 }} />}>
                    <MonteCarloChart
                      monteCarloData={riskData?.monte_carlo}
                      currentValue={riskData?.portfolio_value}
                      currency={activePortfolio?.currency}
                    />
                  </Suspense>
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
                  <Suspense fallback={<div className="skeleton" style={{ height: 300, borderRadius: 12 }} />}>
                    <ExportPanel token={token} portfolioId={activePortId} portfolioName={activePortfolio?.name} />
                  </Suspense>
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

      {/* Upload Portfolio Modal */}
      {showUploadModal && (
        <UploadPortfolioModal
          onConfirm={handleUploadPortfolio}
          onCancel={() => setShowUploadModal(false)}
        />
      )}
    </div>
  );
}
