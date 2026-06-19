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

  let res;
  try {
    res = await fetch(`${BASE}${path}`, opts);
  } catch (networkErr) {
    // fetch() only throws on network-level failures (DNS, connection reset, CORS block, etc.)
    console.error(`[API] Network error on ${method} ${path}:`, networkErr);
    throw new Error(
      `Cannot reach server. Please check your internet connection and try again. (${networkErr.message})`
    );
  }

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

/** Retry wrapper — retries on network errors with exponential backoff */
async function requestWithRetry(method, path, body = null, token = null, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await request(method, path, body, token);
    } catch (err) {
      const isNetworkError = err.message.includes('Cannot reach server');
      if (isNetworkError && attempt < retries) {
        const delay = 1000 * (attempt + 1); // 1s, 2s
        console.warn(`[API] Retry ${attempt + 1}/${retries} in ${delay}ms…`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

const api = {
  /** Auth — wakes backend then authenticates with retry */
  loginWithGoogle: async (idToken) => {
    // Wake backend first (Railway cold starts can cause the auth POST to fail)
    try {
      await fetch(`${BASE}/health`, { method: 'GET' });
    } catch (_) {
      // Ignore — the retry below will handle a truly down server
    }

    const data = await requestWithRetry('POST', '/auth/google', { id_token: idToken });
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

  uploadPortfolioFile: async (token, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(`${BASE}/portfolios/upload`, {
        method: 'POST',
        headers,
        body: formData,
      });
    } catch (networkErr) {
      console.error(`[API] Network error on POST /portfolios/upload:`, networkErr);
      throw new Error(
        `Cannot reach server. Please check your internet connection and try again. (${networkErr.message})`
      );
    }

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
  },

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

  /** Top Traders */
  getTraders: (token) => request('GET', '/traders', null, token),

  getTraderDetail: (token, traderId) =>
    request('GET', `/traders/${traderId}`, null, token),

  getTraderNews: (token, traderId) =>
    request('GET', `/traders/${traderId}/news`, null, token),
};

/** WebSocket factory for live price updates */
export function createPriceSocket(portfolioId, token, onMessage, onError) {
  const url = `${WS_BASE}/ws/${portfolioId}?token=${encodeURIComponent(token)}`;
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
