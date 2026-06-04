import React, { useMemo, useState } from 'react';

// Interpolate a tricolor gradient: negative=red, zero=gray, positive=green
function correlationColor(val) {
  const clamped = Math.max(-1, Math.min(1, val));
  if (isNaN(clamped)) return 'var(--surface-3)';

  if (clamped >= 0) {
    // 0 → gray (#2a2a3e), 1 → accent green (#00d4aa)
    const t = clamped;
    const r = Math.round(42 + t * (0   - 42));
    const g = Math.round(42 + t * (212 - 42));
    const b = Math.round(62 + t * (170 - 62));
    return `rgba(${r},${g},${b},${0.25 + t * 0.65})`;
  } else {
    // -1 → red (#ff4d4d), 0 → gray (#2a2a3e)
    const t = -clamped;
    const r = Math.round(42 + t * (255 - 42));
    const g = Math.round(42 + t * (77  - 42));
    const b = Math.round(62 + t * (77  - 62));
    return `rgba(${r},${g},${b},${0.25 + t * 0.65})`;
  }
}

function textColor(val) {
  if (Math.abs(val) > 0.6) return '#fff';
  return 'var(--text-muted)';
}

function HeatmapTooltip({ ticker1, ticker2, value, style }) {
  return (
    <div style={{
      position: 'fixed',
      ...style,
      background: 'var(--surface-2)',
      border: '1px solid var(--border-light)',
      borderRadius: 8,
      padding: '10px 14px',
      zIndex: 200,
      pointerEvents: 'none',
      fontSize: 12,
      boxShadow: 'var(--shadow)',
      whiteSpace: 'nowrap',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        {ticker1} × {ticker2}
      </div>
      <div style={{ color: value >= 0 ? 'var(--accent)' : 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600 }}>
        {value.toFixed(4)}
      </div>
      <div style={{ color: 'var(--text-faint)', marginTop: 4 }}>
        {value >= 0.7 ? 'Highly correlated' :
         value >= 0.4 ? 'Moderately correlated' :
         value >= 0   ? 'Weakly correlated' :
         value >= -0.4 ? 'Weakly negatively correlated' :
         value >= -0.7 ? 'Moderately negatively correlated' :
         'Highly negatively correlated'}
      </div>
    </div>
  );
}

export default function CorrelationHeatmap({ matrix }) {
  const [tooltip, setTooltip] = useState(null);

  const tickers = useMemo(() => {
    if (!matrix) return [];
    return Object.keys(matrix);
  }, [matrix]);

  if (!matrix || tickers.length === 0) {
    return (
      <div className="chart-card">
        <div className="chart-title">Asset Correlation Matrix</div>
        <div className="empty-state">
          <div className="empty-icon">🔲</div>
          <div className="empty-title">No Correlation Data</div>
          <div className="empty-desc">Correlation matrix requires at least 2 holdings with sufficient price history.</div>
        </div>
      </div>
    );
  }

  const cellSize = Math.max(44, Math.min(70, Math.floor(520 / (tickers.length + 1))));
  const labelWidth = 64;

  const handleMouseEnter = (e, t1, t2, val) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ ticker1: t1, ticker2: t2, value: val, x: rect.left + rect.width / 2, y: rect.top - 8 });
  };

  const handleMouseLeave = () => setTooltip(null);

  return (
    <div className="chart-card">
      <div className="chart-title" style={{ marginBottom: 4 }}>Asset Correlation Matrix</div>
      <div className="chart-subtitle">Pairwise Pearson correlation of daily returns (–1 to +1)</div>

      {/* Color scale legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, marginTop: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--danger)' }}>–1</span>
        <div style={{
          width: 160,
          height: 8,
          borderRadius: 4,
          background: 'linear-gradient(to right, rgba(255,77,77,0.9), rgba(42,42,62,0.6), rgba(0,212,170,0.9))',
        }} />
        <span style={{ fontSize: 11, color: 'var(--accent)' }}>+1</span>
        <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 8 }}>
          Negative correlation ← → Positive correlation
        </span>
      </div>

      <div className="heatmap-wrap">
        <div style={{ display: 'inline-block' }}>
          {/* Column labels (X-axis) */}
          <div style={{ display: 'flex', marginLeft: labelWidth, marginBottom: 2 }}>
            {tickers.map((t) => (
              <div
                key={t}
                style={{
                  width: cellSize,
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  padding: '0 2px',
                }}
                title={t}
              >
                {t.length > 7 ? t.slice(0, 6) + '…' : t}
              </div>
            ))}
          </div>

          {/* Rows */}
          {tickers.map((rowTicker) => (
            <div key={rowTicker} style={{ display: 'flex', marginBottom: 2, alignItems: 'center' }}>
              {/* Row label (Y-axis) */}
              <div style={{
                width: labelWidth,
                fontSize: 10,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                textAlign: 'right',
                paddingRight: 8,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }} title={rowTicker}>
                {rowTicker.length > 8 ? rowTicker.slice(0, 7) + '…' : rowTicker}
              </div>

              {/* Cells */}
              {tickers.map((colTicker) => {
                const val = matrix[rowTicker]?.[colTicker] ?? 0;
                const isDiag = rowTicker === colTicker;
                return (
                  <div
                    key={colTicker}
                    onMouseEnter={(e) => handleMouseEnter(e, rowTicker, colTicker, val)}
                    onMouseLeave={handleMouseLeave}
                    style={{
                      width: cellSize,
                      height: cellSize - 4,
                      background: isDiag ? 'var(--surface-3)' : correlationColor(val),
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--font-mono)',
                      fontSize: Math.max(9, cellSize / 6),
                      fontWeight: isDiag ? 700 : 500,
                      color: isDiag ? 'var(--accent)' : textColor(val),
                      cursor: 'default',
                      transition: 'transform 0.15s, box-shadow 0.15s',
                      marginRight: 2,
                      border: isDiag ? '1px solid rgba(0,212,170,0.3)' : '1px solid transparent',
                      userSelect: 'none',
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'scale(1.12)';
                      e.currentTarget.style.zIndex = '10';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.zIndex = '1';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {isDiag ? '1.00' : val.toFixed(2)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <HeatmapTooltip
          ticker1={tooltip.ticker1}
          ticker2={tooltip.ticker2}
          value={tooltip.value}
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        />
      )}
    </div>
  );
}
