# Portfolio Risk Monitor

A production-grade, real-time portfolio risk analytics platform.  
Users build equity portfolios and receive live VaR, Sharpe, beta, and correlation metrics streamed over WebSockets — backed by PostgreSQL + TimescaleDB + Redis.

> **Stack:** FastAPI · PostgreSQL · TimescaleDB · Redis pub/sub · WebSockets · React · Docker · Railway

---

## Live Demo

> `https://your-railway-url.up.railway.app`

Add tickers → watch risk metrics update live.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        React Frontend                       │
│  Auth → Portfolio Builder → Live Risk Dashboard → Charts    │
└──────────────────────┬──────────────────────────────────────┘
                       │  REST + WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│                   FastAPI Backend                           │
│  /auth  /portfolios  /ws/portfolio/{id}                     │
│  ├─ JWT Auth (python-jose + bcrypt)                         │
│  ├─ Risk Engine (NumPy historical simulation)               │
│  ├─ WebSocket Manager (asyncio + Redis pub/sub)             │
│  └─ Price Service (yfinance → Redis cache → TimescaleDB)    │
└────────┬────────────────────────┬───────────────────────────┘
         │                        │
┌────────▼──────────┐   ┌────────▼──────────────────────────┐
│  PostgreSQL 16    │   │  Redis 7                          │
│  + TimescaleDB    │   │  ├─ price:{ticker} cache           │
│  ├─ users         │   │  ├─ WebSocket session registry     │
│  ├─ portfolios    │   │  └─ pub/sub: price_updates         │
│  ├─ holdings      │   └────────────────────────────────────┘
│  ├─ prices*       │
│  └─ risk_snapshots│
│  (*hypertable)    │
└───────────────────┘
```

---

## Risk Metrics Computed

| Metric | Method |
|--------|--------|
| **VaR 95% / 99%** | Historical simulation (non-parametric) |
| **CVaR 95%** | Expected shortfall beyond VaR |
| **Sharpe Ratio** | Annualised, RF = 5% |
| **Sortino Ratio** | Downside deviation only |
| **Beta** | vs SPY (252-day rolling) |
| **Max Drawdown** | Peak-to-trough on cumulative returns |
| **Correlation Matrix** | Pairwise Pearson on log-returns |

All metrics use 252 trading days of historical simulation — no normality assumption.

---

## Quick Start (Local)

### Prerequisites
- Docker + Docker Compose
- Git

```bash
# 1. Clone
git clone https://github.com/Yuvi9559/portfolio-risk-monitor.git
cd portfolio-risk-monitor

# 2. Set environment variables
cp .env.example .env
# Edit .env — set a strong SECRET_KEY:
# openssl rand -hex 32

# 3. Start all services
docker compose up --build

# 4. Visit
# Frontend: http://localhost:3000
# API docs: http://localhost:8000/docs
```

First boot takes ~2 minutes while TimescaleDB initialises and dependencies install.

---

## API Reference

```
POST /auth/register   → Create account, returns JWT
POST /auth/login      → Login, returns JWT

GET  /portfolios              → List user portfolios
POST /portfolios              → Create portfolio
DELETE /portfolios/{id}       → Delete portfolio

GET  /portfolios/{id}/holdings        → List holdings with live prices
POST /portfolios/{id}/holdings        → Add / update holding
DELETE /portfolios/{id}/holdings/{t}  → Remove holding

GET  /portfolios/{id}/risk            → Current risk metrics (REST)
GET  /portfolios/{id}/risk/history    → Historical snapshots

WS   /ws/portfolio/{id}?token=<JWT>   → Live risk stream
```

Full interactive docs at `/docs` (Swagger UI).

---

## WebSocket Protocol

```json
// Server → Client (every ~30s or on price update)
{
  "type": "risk_update",
  "portfolio_value": 125430.50,
  "var_95": 0.0234,
  "cvar_95": 0.0312,
  "sharpe": 1.45,
  "sortino": 2.01,
  "beta": 0.87,
  "max_drawdown": -0.142,
  "holdings": [...],
  "correlation": {"AAPL": {"MSFT": 0.73, ...}},
  "weights": {"AAPL": 0.45, "MSFT": 0.31, ...}
}

// Client → Server (optional manual refresh)
{ "type": "refresh" }
```

---

## Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up

# Set environment variables in Railway dashboard:
# SECRET_KEY, DATABASE_URL, REDIS_URL
```

Railway auto-detects the Dockerfile and docker-compose.yml.  
Add a PostgreSQL plugin (includes TimescaleDB) and Redis plugin from the Railway dashboard.

---

## Project Structure

```
portfolio-risk-monitor/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + lifespan
│   │   ├── config.py            # Settings (pydantic-settings)
│   │   ├── database.py          # SQLAlchemy async engine
│   │   ├── models.py            # ORM models
│   │   ├── schemas.py           # Pydantic request/response schemas
│   │   ├── auth.py              # JWT + bcrypt utilities
│   │   ├── routers/
│   │   │   ├── auth.py          # /auth/* endpoints
│   │   │   ├── portfolios.py    # /portfolios/* endpoints
│   │   │   └── websocket.py     # /ws/portfolio/{id}
│   │   └── services/
│   │       ├── risk_engine.py   # VaR, Sharpe, Beta, drawdown
│   │       ├── price_service.py # yfinance → Redis → TimescaleDB
│   │       └── ws_manager.py    # WebSocket connection manager
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── components/
│   │   │   ├── Auth.jsx              # Login / Register
│   │   │   ├── Dashboard.jsx         # Main layout
│   │   │   ├── RiskMetricsPanel.jsx  # Live metrics + holdings
│   │   │   ├── CorrelationHeatmap.jsx
│   │   │   ├── PortfolioBuilder.jsx
│   │   │   └── RiskHistory.jsx       # Sharpe/VaR charts
│   │   └── services/api.js           # REST + WebSocket client
│   ├── package.json
│   ├── vite.config.js
│   ├── nginx.conf
│   └── Dockerfile
├── init.sql              # TimescaleDB schema + hypertables
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Resume Statement

> *"Built and deployed a multi-tenant portfolio risk analytics platform — live VaR/CVaR/Sharpe/Beta computation broadcast via WebSocket to concurrent users, backed by PostgreSQL + TimescaleDB for price history and risk snapshot persistence, Redis pub/sub for real-time price broadcast, JWT auth with bcrypt, and a React dashboard with live correlation heatmap. Deployed on Railway via Docker Compose."*

---

## Author

**Yuvraj Singh Chauhan**  
B.Tech Computer Science · Parul University · 2027  
[github.com/Yuvi9559](https://github.com/Yuvi9559) · [linkedin.com/in/yuvrajchauhan-151989251](https://linkedin.com/in/yuvrajchauhan-151989251)
