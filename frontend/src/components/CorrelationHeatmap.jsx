export default function CorrelationHeatmap({ matrix }) {
  const tickers = Object.keys(matrix);

  const color = (v) => {
    // -1 (red) → 0 (white) → +1 (blue)
    if (v >= 0) {
      const r = Math.round(255 - v * 120);
      const g = Math.round(255 - v * 100);
      const b = 255;
      return `rgb(${r},${g},${b})`;
    } else {
      const abs = Math.abs(v);
      const r = 255;
      const g = Math.round(255 - abs * 100);
      const b = Math.round(255 - abs * 120);
      return `rgb(${r},${g},${b})`;
    }
  };

  const textColor = (v) => Math.abs(v) > 0.6 ? "#fff" : "#1a1a1a";

  return (
    <div className="section-block">
      <div className="section-title">Correlation Matrix</div>
      <div className="corr-wrap">
        <div className="corr-grid" style={{ gridTemplateColumns: `80px repeat(${tickers.length}, 1fr)` }}>
          {/* Header row */}
          <div className="corr-cell header-corner" />
          {tickers.map(t => (
            <div key={t} className="corr-cell header-cell">{t}</div>
          ))}
          {/* Data rows */}
          {tickers.map(row => (
            <>
              <div key={`label-${row}`} className="corr-cell row-label">{row}</div>
              {tickers.map(col => {
                const v = matrix[row]?.[col] ?? 0;
                return (
                  <div
                    key={`${row}-${col}`}
                    className="corr-cell data-cell"
                    style={{ background: color(v), color: textColor(v) }}
                    title={`${row} / ${col}: ${v.toFixed(4)}`}
                  >
                    {v.toFixed(2)}
                  </div>
                );
              })}
            </>
          ))}
        </div>
        <div className="corr-legend">
          <span style={{color:"#dc2626"}}>■</span> Negative correlation
          &nbsp;&nbsp;
          <span style={{color:"#9999ff"}}>■</span> Positive correlation
        </div>
      </div>
    </div>
  );
}
