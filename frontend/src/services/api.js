const BASE =
  import.meta.env.VITE_API_URL ||
  'https://portfolio-risk-monitor-production.up.railway.app';

const WS_BASE = (
  import.meta.env.VITE_WS_URL ||
  'wss://portfolio-risk-monitor-production.up.railway.app'
).replace(/^http/, 'ws');

async function request(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      msg = err.detail || err.message || msg;
    } catch (_) {}
    throw new Error(msg);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res;
}

const api = {
  /** Auth — reshapes flat backend response into { access_token, user } */
  loginWithGoogle: async (idToken) => {
    const data = await request('POST', '/auth/google', { id_token: idToken });
    // Backend returns: { access_token, token_type, user_id, email, full_name, avatar_url }
    // Reshape into session format App.jsx expects: { access_token, user: {...} }
    return {
      access_token: data.access_token,
      user: {
        id: data.user_id,
        email: data.email,
        name: data.full_name,
        picture: data.avatar_url,
      },
    };
  },

  /** Portfolios — prefix: /portfolios */
  getPortfolios: (token) => request('GET', '/portfolios', null, token),

  createPortfolio: (token, name, benchmark = 'SPY', currency = 'USD') =>
    request('POST', '/portfolios', { name, benchmark, currency }, token),

  deletePortfolio: (token, id) =>
    request('DELETE', `/portfolios/${id}`, null, token),

  /** Holdings — nested under /portfolios */
  getHoldings: (token, portfolioId) =>
    request('GET', `/portfolios/${portfolioId}/holdings`, null, token),

  addHolding: (token, portfolioId, symbol, asset_type, shares, avg_cost) =>
    request(
      'POST',
      `/portfolios/${portfolioId}/holdings`,
      {
        symbol,
        asset_type,
        shares: parseFloat(shares),
        avg_cost: avg_cost ? parseFloat(avg_cost) : null,
      },
      token
    ),

  removeHolding: (token, portfolioId, symbol) =>
    request('DELETE', `/portfolios/${portfolioId}/holdings/${symbol}`, null, token),

  /** Risk — prefix: /risk (NOT /portfolios/{id}/risk) */
  getRisk: (token, portfolioId) =>
    request('GET', `/risk/${portfolioId}`, null, token),

  getRiskHistory: (token, portfolioId, days = 30) =>
    request('GET', `/risk/${portfolioId}/history?days=${days}`, null, token),

  /** News — prefix: /news (NOT /portfolios/{id}/news) */
  getNews: (token, portfolioId) =>
    request('GET', `/news/${portfolioId}`, null, token),

  /** Export — prefix: /export (NOT /portfolios/{id}/export) */
  exportPDF: async (token, portfolioId) => {
    const res = await fetch(`${BASE}/export/${portfolioId}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('PDF export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio_risk_report.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  exportExcel: async (token, portfolioId) => {
    const res = await fetch(`${BASE}/export/${portfolioId}/excel`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Excel export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio_risk_report.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

/** WebSocket factory for live price updates */
export function createPriceSocket(portfolioId, token, onMessage, onError) {
  const url = `${WS_BASE}/ws/prices/${portfolioId}?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url);

  ws.onopen = () => console.log('[WS] connected');
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onMessage(data);
    } catch (err) {
      console.error('[WS] parse error', err);
    }
  };
  ws.onerror = (e) => {
    console.error('[WS] error', e);
    if (onError) onError(e);
  };
  ws.onclose = () => console.log('[WS] disconnected');

  return { close: () => ws.close() };
}

export default api;
