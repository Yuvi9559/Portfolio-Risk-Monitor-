const BASE = import.meta.env.VITE_API_URL || "https://portfolio-risk-monitor-production.up.railway.app";

async function request(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  register: (email, password, full_name) =>
    request("POST", "/auth/register", { email, password, full_name }),

  login: (email, password) =>
    request("POST", "/auth/login", { email, password }),

  getPortfolios: (token) =>
    request("GET", "/portfolios", null, token),

  createPortfolio: (token, name, benchmark = "SPY") =>
    request("POST", "/portfolios", { name, benchmark }, token),

  deletePortfolio: (token, id) =>
    request("DELETE", `/portfolios/${id}`, null, token),

  getHoldings: (token, portfolioId) =>
    request("GET", `/portfolios/${portfolioId}/holdings`, null, token),

  addHolding: (token, portfolioId, ticker, shares, avg_cost) =>
    request("POST", `/portfolios/${portfolioId}/holdings`, { ticker, shares, avg_cost }, token),

  removeHolding: (token, portfolioId, ticker) =>
    request("DELETE", `/portfolios/${portfolioId}/holdings/${ticker}`, null, token),

  getRisk: (token, portfolioId) =>
    request("GET", `/portfolios/${portfolioId}/risk`, null, token),

  getRiskHistory: (token, portfolioId, days = 30) =>
    request("GET", `/portfolios/${portfolioId}/risk/history?days=${days}`, null, token),
};

// WebSocket
const WS_BASE = (import.meta.env.VITE_WS_URL || "wss://portfolio-risk-monitor-production.up.railway.app").replace(/^http/, "ws");

export function createRiskSocket(portfolioId, token, onMessage, onError) {
  const ws = new WebSocket(`${WS_BASE}/ws/portfolio/${portfolioId}?token=${token}`);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onerror   = (e) => onError && onError(e);
  ws.onclose   = () => console.log("WS closed");
  return ws;
}
