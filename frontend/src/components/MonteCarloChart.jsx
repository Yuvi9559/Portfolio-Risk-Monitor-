import React, { useMemo } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';

function formatValue(val, currency = 'USD') {
  if (val == null || isNaN(val)) return '—';
  const symbols = { USD: '$', INR: '₹', EUR: '€', GBP: '£' };
  const sym = symbols[currency] || '$';
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${sym}${(val / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sym}${(val / 1_000).toFixed(2)}K`;
  return `${sym}${Number(val).toFixed(2)}`;
}

const CustomTooltip = ({ active, payload, label, currency }) => {
  if (!active || !payload?.length) return null;

  return (
    <div style={{
      background: 'var(--surface-2)',
      border: '1px solid var(--border-light)',
      borderRadius: 8,
      padding: '12px 16px',
      boxShadow: 'var(--shadow)',
      fontSize: 12,
      minWidth: 180,
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
        Day {label}
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {formatValue(p.value, currency)}
          </span>
        </div>
      ))}
    </div>
  );
};

const DARK_GRID = '#1e1e2e';

export default function MonteCarloChart({ monteCarloData, currentValue, currency = 'USD' }) {
  // Build chart data from API response
  const chartData = useMemo(() => {
    if (!monteCarloData) return null;

    // Support both array format and object format
    if (Array.isArray(monteCarloData)) {
      // Already formatted: [{ day, p5, p50, p95 }]
      return monteCarloData;
    }

    // Object format: { p5: [...], p50: [...], p95: [...] }
    const { p5, p50, p95 } = monteCarloData;
    if (!p50) return null;

    const len = p50.length;
    return Array.from({ length: len }, (_, i) => ({
      day: i,
      p5: p5?.[i] ?? null,
      p50: p50[i],
      p95: p95?.[i] ?? null,
    }));
  }, [monteCarloData]);

  if (!chartData) {
    return (
      <div className="chart-card">
        <div className="chart-title">Monte Carlo Simulation — 90-Day Outlook</div>
        <div className="chart-subtitle">Probabilistic portfolio value projection</div>
        <div className="empty-state">
          <div className="empty-icon">🎲</div>
          <div className="empty-title">No Simulation Data</div>
          <div className="empty-desc">
            Add holdings to your portfolio and calculate risk metrics to run Monte Carlo simulations.
          </div>
        </div>
      </div>
    );
  }

  const lastDay = chartData[chartData.length - 1];
  const p5Final  = lastDay?.p5;
  const p50Final = lastDay?.p50;
  const p95Final = lastDay?.p95;

  return (
    <div className="chart-card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <div>
          <div className="chart-title">Monte Carlo Simulation — 90-Day Outlook</div>
          <div className="chart-subtitle">10,000 simulated paths · Starting value: {formatValue(currentValue, currency)}</div>
        </div>
        {/* Summary badges */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600, marginBottom: 2 }}>PESSIMISTIC (P5)</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--danger)' }}>
              {formatValue(p5Final, currency)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 2 }}>EXPECTED (P50)</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--accent)' }}>
              {formatValue(p50Final, currency)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 600, marginBottom: 2 }}>OPTIMISTIC (P95)</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: '#4ade80' }}>
              {formatValue(p95Final, currency)}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="chart-legend">
        <div className="legend-item">
          <div className="legend-line" style={{ borderTop: '2px dashed #ff4d4d', background: 'none' }} />
          <span>Pessimistic (5th percentile)</span>
        </div>
        <div className="legend-item">
          <div className="legend-line" style={{ background: 'var(--accent)' }} />
          <span>Expected (50th percentile)</span>
        </div>
        <div className="legend-item">
          <div className="legend-line" style={{ borderTop: '2px dashed #4ade80', background: 'none' }} />
          <span>Optimistic (95th percentile)</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={380}>
        <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
          <defs>
            <linearGradient id="mc-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#00d4aa" stopOpacity={0.12} />
              <stop offset="95%" stopColor="#00d4aa" stopOpacity={0.01} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={DARK_GRID} strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey="day"
            stroke="var(--text-faint)"
            tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            label={{ value: 'Days', position: 'insideBottom', offset: -4, fill: 'var(--text-muted)', fontSize: 11 }}
          />
          <YAxis
            stroke="var(--text-faint)"
            tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatValue(v, currency)}
            width={80}
          />

          <Tooltip content={<CustomTooltip currency={currency} />} />

          {/* Reference line at current value */}
          {currentValue && (
            <ReferenceLine
              y={currentValue}
              stroke="var(--text-faint)"
              strokeDasharray="4 4"
              label={{ value: 'Current', position: 'right', fill: 'var(--text-faint)', fontSize: 10 }}
            />
          )}

          {/* P5 — pessimistic, dashed red */}
          <Line
            type="monotone"
            dataKey="p5"
            name="Pessimistic (P5)"
            stroke="#ff4d4d"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            activeDot={{ r: 4 }}
          />

          {/* Shaded area for P50 */}
          <Area
            type="monotone"
            dataKey="p50"
            name="Expected (P50)"
            stroke="var(--accent)"
            strokeWidth={2.5}
            fill="url(#mc-fill)"
            dot={false}
            activeDot={{ r: 5, fill: 'var(--accent)' }}
          />

          {/* P95 — optimistic, dashed green */}
          <Line
            type="monotone"
            dataKey="p95"
            name="Optimistic (P95)"
            stroke="#4ade80"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-faint)', textAlign: 'center' }}>
        Based on historical volatility and correlation. Past performance does not guarantee future results.
      </div>
    </div>
  );
}
