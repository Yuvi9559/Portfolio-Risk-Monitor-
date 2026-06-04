import React, { useState } from 'react';
import api from '../services/api';

function ExportButton({ label, icon, subtitle, onClick, loading, variant = 'pdf' }) {
  return (
    <button
      className={`export-btn ${variant}`}
      onClick={onClick}
      disabled={loading}
    >
      <span className="export-btn-icon">{loading ? '⏳' : icon}</span>
      <div style={{ textAlign: 'left' }}>
        <div>{loading ? 'Generating…' : label}</div>
        <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>{subtitle}</div>
      </div>
      {loading && (
        <span className="spinner" style={{ marginLeft: 'auto' }} />
      )}
    </button>
  );
}

function StatBox({ label, value, icon }) {
  return (
    <div style={{
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
    }}>
      <div style={{ fontSize: 24 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-faint)', marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
      </div>
    </div>
  );
}

export default function ExportPanel({ token, portfolioId, portfolioName }) {
  const [pdfLoading, setPdfLoading]     = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [pdfError, setPdfError]         = useState('');
  const [excelError, setExcelError]     = useState('');
  const [pdfDone, setPdfDone]           = useState(false);
  const [excelDone, setExcelDone]       = useState(false);

  const handlePDF = async () => {
    setPdfLoading(true);
    setPdfError('');
    setPdfDone(false);
    try {
      await api.exportPDF(token, portfolioId);
      setPdfDone(true);
      setTimeout(() => setPdfDone(false), 4000);
    } catch (err) {
      setPdfError(err.message || 'PDF export failed');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleExcel = async () => {
    setExcelLoading(true);
    setExcelError('');
    setExcelDone(false);
    try {
      await api.exportExcel(token, portfolioId);
      setExcelDone(true);
      setTimeout(() => setExcelDone(false), 4000);
    } catch (err) {
      setExcelError(err.message || 'Excel export failed');
    } finally {
      setExcelLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Main export card */}
      <div className="export-card">
        <div className="table-title" style={{ marginBottom: 6 }}>Export Portfolio Report</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, maxWidth: 500 }}>
          Download a comprehensive report for <strong style={{ color: 'var(--text-primary)' }}>{portfolioName || 'your portfolio'}</strong>. 
          Reports include holdings, risk metrics (VaR, Sharpe, Drawdown), performance history, 
          correlation matrix, and Monte Carlo projections.
        </div>

        {/* Stat boxes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
          <StatBox icon="📋" label="Includes" value="Holdings & Positions" />
          <StatBox icon="📊" label="Risk Metrics" value="VaR, CVaR, Sharpe, Beta" />
          <StatBox icon="🎲" label="Simulation" value="Monte Carlo 90-day" />
        </div>

        <div className="export-buttons">
          <ExportButton
            label={pdfDone ? '✓ Downloaded!' : 'Download PDF Report'}
            icon="📄"
            subtitle="Risk report with charts & analysis"
            onClick={handlePDF}
            loading={pdfLoading}
            variant="pdf"
          />
          <ExportButton
            label={excelDone ? '✓ Downloaded!' : 'Download Excel'}
            icon="📊"
            subtitle="Raw data for further analysis"
            onClick={handleExcel}
            loading={excelLoading}
            variant="excel"
          />
        </div>

        {pdfError && (
          <div className="auth-error" style={{ marginTop: 12 }}>⚠ PDF: {pdfError}</div>
        )}
        {excelError && (
          <div className="auth-error" style={{ marginTop: 8 }}>⚠ Excel: {excelError}</div>
        )}

        {(pdfDone || excelDone) && (
          <div style={{
            marginTop: 12,
            padding: '10px 14px',
            background: 'var(--accent-dim)',
            border: '1px solid rgba(0,212,170,0.3)',
            borderRadius: 8,
            color: 'var(--accent)',
            fontSize: 13,
          }}>
            ✓ Your download has started. Check your browser's download folder.
          </div>
        )}

        <div className="export-note">
          Reports are generated in real-time using the latest portfolio data.
          PDF generation may take a few seconds. Files are not stored on our servers.
        </div>
      </div>

      {/* Data format info */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
      }}>
        <div className="chart-card">
          <div className="chart-title" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📄</span> PDF Report Contents
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'Portfolio overview & metrics',
              'Risk metrics (VaR, CVaR, Sharpe, Beta)',
              'Holdings table with current prices',
              'P&L breakdown per holding',
              'Correlation heatmap (visual)',
              'Monte Carlo chart (90-day)',
              'Historical value chart',
              'Risk methodology notes',
            ].map((item) => (
              <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--accent)', fontSize: 10 }}>●</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="chart-card">
          <div className="chart-title" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📊</span> Excel Workbook Sheets
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'Sheet 1: Holdings & Market Data',
              'Sheet 2: Risk Metrics Summary',
              'Sheet 3: Historical Value Series',
              'Sheet 4: Correlation Matrix',
              'Sheet 5: Monte Carlo Percentiles',
              'Sheet 6: Daily Returns',
              'Sheet 7: P&L Attribution',
              'Sheet 8: Metadata & Settings',
            ].map((item) => (
              <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                <span style={{ color: '#4ade80', fontSize: 10 }}>●</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{
        padding: '14px 18px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        fontSize: 11,
        color: 'var(--text-faint)',
        lineHeight: 1.7,
      }}>
        <strong style={{ color: 'var(--text-muted)' }}>Disclaimer:</strong> All risk metrics, Monte Carlo simulations, and projections are 
        for informational purposes only and do not constitute investment advice. Past performance is not indicative of future results. 
        VaR and CVaR calculations assume normally distributed returns which may not hold during market stress events.
      </div>
    </div>
  );
}
