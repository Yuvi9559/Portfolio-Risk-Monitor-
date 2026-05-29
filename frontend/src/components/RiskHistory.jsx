import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { api } from "../services/api";

export default function RiskHistory({ token, portfolioId }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api.getRiskHistory(token, portfolioId, 60).then(data => {
      const formatted = data
        .map(r => ({
          date: new Date(r.ts).toLocaleDateString("en-GB", { day:"2-digit", month:"short" }),
          sharpe:   parseFloat(r.sharpe?.toFixed(3) ?? 0),
          var_95:   parseFloat((r.var_95 * 100)?.toFixed(3) ?? 0),
          value:    parseFloat(r.portfolio_value?.toFixed(2) ?? 0),
          drawdown: parseFloat((r.max_drawdown * 100)?.toFixed(2) ?? 0),
        }))
        .reverse();
      setHistory(formatted);
    }).catch(() => {});
  }, [portfolioId, token]);

  if (history.length === 0) {
    return <div className="empty-hint">No historical snapshots yet. Risk is computed and stored each time you view your portfolio.</div>;
  }

  return (
    <div className="history-wrap">
      <div className="section-title">Portfolio Value</div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={history} margin={{ top:8, right:16, bottom:0, left:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
          <Tooltip formatter={v => [`$${v.toLocaleString()}`, "Value"]} />
          <Line type="monotone" dataKey="value" stroke="#0f3460" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>

      <div className="section-title" style={{ marginTop:"1.5rem" }}>Sharpe Ratio History</div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={history} margin={{ top:8, right:16, bottom:0, left:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line type="monotone" dataKey="sharpe" stroke="#3b1f6e" strokeWidth={2} dot={false} name="Sharpe" />
        </LineChart>
      </ResponsiveContainer>

      <div className="section-title" style={{ marginTop:"1.5rem" }}>VaR 95% History (%)</div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={history} margin={{ top:8, right:16, bottom:0, left:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
          <Tooltip formatter={v => [`${v}%`, "VaR 95%"]} />
          <Line type="monotone" dataKey="var_95" stroke="#dc2626" strokeWidth={2} dot={false} name="VaR 95%" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
