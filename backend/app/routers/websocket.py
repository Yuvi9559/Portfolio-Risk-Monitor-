from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import decode_token
from app.database import AsyncSessionLocal
from app.models import Holding
from app.services import price_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])

PRICE_UPDATE_INTERVAL = 10  # seconds


# ─────────────────────────────────────────────────────────────────────────────
# Connection Manager
# ─────────────────────────────────────────────────────────────────────────────
class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self) -> None:
        self._active: Dict[str, WebSocket] = {}

    async def connect(self, key: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._active[key] = websocket
        logger.info("WS connected: %s  (total=%d)", key, len(self._active))

    def disconnect(self, key: str) -> None:
        self._active.pop(key, None)
        logger.info("WS disconnected: %s  (total=%d)", key, len(self._active))

    async def send(self, key: str, data: dict) -> None:
        ws = self._active.get(key)
        if ws:
            try:
                await ws.send_text(json.dumps(data))
            except Exception as exc:
                logger.warning("WS send error for %s: %s", key, exc)
                self.disconnect(key)

    async def broadcast(self, data: dict) -> None:
        for key in list(self._active.keys()):
            await self.send(key, data)


manager = ConnectionManager()


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket route
# ─────────────────────────────────────────────────────────────────────────────
@router.websocket("/ws/{portfolio_id}")
async def websocket_prices(
    websocket: WebSocket,
    portfolio_id: uuid.UUID,
) -> None:
    """Stream live price updates every 10 seconds for all holdings in a portfolio.

    Query param ?token=<JWT> is required for authentication.
    """
    # ── Auth ──────────────────────────────────────────────────────────────────
    token: str | None = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        return

    try:
        payload = decode_token(token)
        user_id = uuid.UUID(payload["sub"])
    except Exception as exc:
        logger.warning("WS auth failure: %s", exc)
        await websocket.close(code=4001)
        return

    # ── Verify portfolio ownership ────────────────────────────────────────────
    async with AsyncSessionLocal() as db:
        from app.models import Portfolio

        pf_result = await db.execute(
            select(Portfolio).where(Portfolio.id == portfolio_id)
        )
        portfolio = pf_result.scalar_one_or_none()
        if portfolio is None or portfolio.user_id != user_id:
            await websocket.close(code=4003)
            return

        # Fetch symbols
        h_result = await db.execute(
            select(Holding.symbol).where(Holding.portfolio_id == portfolio_id)
        )
        symbols = [row[0] for row in h_result.fetchall()]

    if not symbols:
        await websocket.accept()
        await websocket.send_text(json.dumps({"type": "error", "message": "No holdings"}))
        await websocket.close()
        return

    conn_key = f"{portfolio_id}:{user_id}"
    await manager.connect(conn_key, websocket)

    try:
        while True:
            prices: Dict[str, float | None] = {}
            for symbol in symbols:
                prices[symbol] = await price_service.get_current_price(symbol)

            await manager.send(
                conn_key,
                {
                    "type": "price_update",
                    "portfolio_id": str(portfolio_id),
                    "prices": prices,
                },
            )
            await asyncio.sleep(PRICE_UPDATE_INTERVAL)
    except WebSocketDisconnect:
        manager.disconnect(conn_key)
    except Exception as exc:
        logger.error("WS error for %s: %s", conn_key, exc)
        manager.disconnect(conn_key)
