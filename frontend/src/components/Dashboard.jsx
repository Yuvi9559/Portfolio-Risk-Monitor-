import { useState, useEffect, useRef } from "react";
import { api, createRiskSocket } from "../services/api";
import RiskMetricsPanel from "./RiskMetricsPanel";
import PortfolioBuilder  from "./PortfolioBuilder";
import CorrelationHeatmap from "./CorrelationHeatmap";
import RiskHistory from "./RiskHistory";

export default function Dashboard({ token, user, onLogout }) {
  const [portfolios, setPortfolios]   = useState([]);
  const [activeId,   setActiveId]     = useState(null);
  const [riskData,   setRiskData]     = useState(null);
  const [wsStatus,   setWsStatus]     = useState("disconnected");
  const [lastUpdate, setLastUpdate]   = useState(null);
  const [tab,        setTab]          = useState("overview"); // overview | builder | history
  const wsRef = useRef(null);

  // Load portfolios on mount
  useEffect(() => {
    api.getPortfolios(token).then(data => {
      setPortfolios(data);
      if (data.length > 0) setActiveId(data[0].id);
    });
  }, [token]);

  // Connect WebSocket when active portfolio changes
  useEffect(() => {
    if (!activeId) return;
    if (wsRef.current) wsRef.current.close();

    setWsStatus("connecting");
    setRiskData(null);

    const ws = createRiskSocket(
      activeId,
      token,
      (msg) => {
        if (msg.type === "risk_update") {
          setRiskData(msg);
          setLastUpdate(new Date());
          setWsStatus("live");
        } else if (msg.type === "error") {
          setWsStatus("error");
        }
      },
      () => setWsStatus("error"),
    );
    ws.onclose = () => setWsStatus("disconnected");
    wsRef.current = ws;

    return () => ws.close();
  }, [activeId, token]);

  const createPortfolio = async () => {
    const name = prompt("Portfolio name:");
    if (!name) return;
    const p = await api.createPortfolio(token, name);
    setPortfolios(prev => [...prev, p]);
    setActiveId(p.id);
  };

  const refreshWs = () => {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: "refresh" }));
    }
  };

  const activePortfolio = portfolios.find(p => p.id === activeId);

  return (
    <div className="dash-root">
      {/* ── Topbar ── */}
      <header className="topbar">
        <div className="topbar-left">
          <span className="logo-mark">◈</span>
          <span className="logo-text">RiskMonitor</span>
        </div>
        <div className="topbar-center">
          <div className="ws-badge" data-status={wsStatus}>
            <span className="ws-dot" />
            {wsStatus === "live" ? "Live" : wsStatus === "connecting" ? "Connecting…" : "Offline"}
          </div>
          {lastUpdate && (
            <span className="last-update">
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="topbar-right">
          <span className="user-email">{user?.email}</span>
          <button className="btn-ghost" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <div className="dash-body">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-label">Portfolios</div>
          {portfolios.map(p => (
            <div
              key={p.id}
              className={`portfolio-item ${p.id === activeId ? "active" : ""}`}
              onClick={() => setActiveId(p.id)}
            >
              <span className="portfolio-name">{p.name}</span>
              <span className="portfolio-bench">{p.benchmark}</span>
            </div>
          ))}
          <button className="btn-sidebar-add" onClick={createPortfolio}>+ New portfolio</button>

          <div className="sidebar-nav">
            {["overview", "builder", "history"].map(t => (
              <div
                key={t}
                className={`nav-item ${tab === t ? "active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main panel ── */}
        <main className="main-panel">
          {!activeId ? (
            <div className="empty-state">
              <div className="empty-icon">◈</div>
              <div>Create a portfolio to get started</div>
              <button className="btn-primary" onClick={createPortfolio}>Create portfolio</button>
            </div>
          ) : (
            <>
              <div className="panel-header">
                <div>
                  <h1 className="panel-title">{activePortfolio?.name}</h1>
                  <div className="panel-sub">Benchmark: {activePortfolio?.benchmark}</div>
                </div>
                <button className="btn-refresh" onClick={refreshWs} title="Force refresh">⟳ Refresh</button>
              </div>

              {tab === "overview" && (
                <>
                  {riskData
                    ? <RiskMetricsPanel data={riskData} />
                    : <div className="loading-state">Computing risk metrics…</div>
                  }
                  {riskData?.correlation && Object.keys(riskData.correlation).length > 1 && (
                    <CorrelationHeatmap matrix={riskData.correlation} />
                  )}
                </>
              )}

              {tab === "builder" && (
                <PortfolioBuilder
                  token={token}
                  portfolioId={activeId}
                  onUpdate={refreshWs}
                />
              )}

              {tab === "history" && (
                <RiskHistory token={token} portfolioId={activeId} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
