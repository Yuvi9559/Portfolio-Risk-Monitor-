import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import api from '../services/api';

const DAY_OPTIONS = [
  { label: '7D', value: 7 },
  { label: '30D', value: 30 },
  { label: '90D', value: 90 },
];

function formatCurrency(val, currency = 'USD') {
  if (val == null || isNaN(val)) return '—';
  const symbols = { USD: '$', INR: '₹', EUR: '€', GBP: '£' };
  const sym = symbols[currency] || '$';
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${sym}${(val / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sym}${(val / 1_000).toFixed(2)}K`;
  return `${sym}${Number(val).toFixed(2)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CustomTooltip = ({ active, payload, label, currency }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--surface-2)',
      border: '1px solid var(--border-light)',
      borderRadius: 8,
      padding: '10px 14px',
      boxShadow: 'var(--shadow)',
      fontSize: 12,
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {p.dataKey === 'value' ? formatCurrency(p.value, currency) : formatCurrency(p.value, currency)}
          </span>
        </div>
      ))}
    </div>
  );
};

function ChartSkeleton() {
  return (
    <div className="chart-card">
      <div className="skeleton" style={{ height: 16, width: '30%', marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 12, width: '20%', marginBottom: 20 }} />
      <div className="skeleton" style={{ height: 240, borderRadius: 8 }} />
    </div>
  );
}

export default function RiskHistory({ token, portfolioId, currency = 'USD' }) {
  const [days, setDays]         = useState(30);
  const [history, setHistory]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getRiskHistory(token, portfolioId, days);
      setHistory(data);
    } catch (err) {
      setError(err.message || 'Failed to load history');
      setHistory(null);
    } finally {
      setLoading(false);
    }
  }, [token, portfolioId, days]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-error">{error}</div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="chart-card">
        <div className="empty-state">
          <div className="empty-icon">📈</div>
          <div className="empty-title">No Historical Data</div>
          <div className="empty-desc">Risk history will accumulate as you track your portfolio over time.</div>
        </div>
      </div>
    );
  }

  // Normalize data
  const chartData = history.map((d) => ({
    date: formatDate(d.ts),
    value: d.portfolio_value ?? d.value,
    var95: d.var_95 ?? d.var95,
  }));

  // Compute change stats
  const first = chartData[0]?.value;
  const last  = chartData[chartData.length - 1]?.value;
  const change = first && last ? ((last - first) / first * 100) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Day selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {change != null && (
            <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: change >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
              {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}% over {days}D
            </div>
          )}
        </div>
        <div className="day-selector">
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`day-btn ${days === opt.value ? 'active' : ''}`}
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Portfolio Value Chart */}
      <div className="chart-card">
        <div className="chart-title">Portfolio Value</div>
        <div className="chart-subtitle" style={{ marginBottom: 20 }}>
          Historical portfolio valuation over the last {days} days
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
            <defs>
              <linearGradient id="val-color" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00d4aa" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00d4aa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1e1e2e" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="var(--text-faint)"
              tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
              tickLine={false}
              axisLine={false}
              interval={Math.max(1, Math.floor(chartData.length / 8))}
            />
            <YAxis
              stroke="var(--text-faint)"
              tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatCurrency(v, currency)}
              width={80}
            />
            <Tooltip content={<CustomTooltip currency={currency} />} />
            <Line
              type="monotone"
              dataKey="value"
              name="Portfolio Value"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--bg)', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* VaR 95% Chart */}
      <div className="chart-card">
        <div className="chart-title">VaR 95% (1-Day)</div>
        <div className="chart-subtitle" style={{ marginBottom: 20 }}>
          Maximum expected daily loss at 95% confidence level
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
            <CartesianGrid stroke="#1e1e2e" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="var(--text-faint)"
              tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
              tickLine={false}
              axisLine={false}
              interval={Math.max(1, Math.floor(chartData.length / 8))}
            />
            <YAxis
              stroke="var(--text-faint)"
              tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatCurrency(v, currency)}
              width={80}
            />
            <Tooltip content={<CustomTooltip currency={currency} />} />
            <Line
              type="monotone"
              dataKey="var95"
              name="VaR 95%"
              stroke="var(--danger)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: 'var(--danger)', stroke: 'var(--bg)', strokeWidth: 2 }}
              strokeDasharray="4 2"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
