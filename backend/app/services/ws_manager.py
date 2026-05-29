"""
WebSocket Connection Manager
============================
Tracks active connections per portfolio_id.
Listens to Redis pub/sub for price updates and
triggers risk recomputation + broadcast.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import WebSocket

log = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # {portfolio_id: set[WebSocket]}
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, portfolio_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._connections[portfolio_id].add(ws)
        log.info(f"WS connected: portfolio={portfolio_id} | total={self.total_connections}")

    async def disconnect(self, portfolio_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._connections[portfolio_id].discard(ws)
            if not self._connections[portfolio_id]:
                del self._connections[portfolio_id]
        log.info(f"WS disconnected: portfolio={portfolio_id}")

    async def broadcast_to_portfolio(self, portfolio_id: str, data: dict) -> None:
        """Send a JSON message to all sessions watching this portfolio."""
        conns = self._connections.get(portfolio_id, set()).copy()
        dead = set()
        for ws in conns:
            try:
                await ws.send_json(data)
            except Exception:
                dead.add(ws)
        # Clean up dead connections
        if dead:
            async with self._lock:
                self._connections[portfolio_id] -= dead

    async def send_error(self, ws: WebSocket, msg: str) -> None:
        try:
            await ws.send_json({"type": "error", "message": msg})
        except Exception:
            pass

    @property
    def total_connections(self) -> int:
        return sum(len(v) for v in self._connections.values())

    @property
    def active_portfolios(self) -> list[str]:
        return list(self._connections.keys())


# Module-level singleton
manager = ConnectionManager()
