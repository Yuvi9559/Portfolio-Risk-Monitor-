"""
WebSocket Endpoint
==================
ws://host/ws/portfolio/{portfolio_id}?token=<JWT>

On connect   → sends full risk metrics immediately
On price tick → recomputes and sends updated metrics
On disconnect → cleans up session
"""
import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.auth import get_user_id_from_token
from app.database import AsyncSessionLocal
from app.models import Portfolio
from app.routers.portfolios import _compute_risk_payload
from app.services.ws_manager import manager

router = APIRouter(tags=["WebSocket"])
log = logging.getLogger(__name__)

# How often (seconds) to push a full risk refresh even without a price event
HEARTBEAT_INTERVAL = 30


@router.websocket("/ws/portfolio/{portfolio_id}")
async def portfolio_ws(portfolio_id: str, websocket: WebSocket):
    # ── Auth via query param token ────────────────────────────
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    try:
        user_id = get_user_id_from_token(token)
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # ── Validate portfolio ownership ──────────────────────────
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Portfolio).where(
                Portfolio.id == portfolio_id,
                Portfolio.user_id == user_id,
            )
        )
        portfolio = result.scalar_one_or_none()
        if not portfolio:
            await websocket.close(code=4004, reason="Portfolio not found")
            return

    # ── Connect ───────────────────────────────────────────────
    await manager.connect(portfolio_id, websocket)

    async def send_metrics():
        """Compute and broadcast current risk metrics."""
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Portfolio).where(Portfolio.id == portfolio_id)
                )
                p = result.scalar_one_or_none()
                if not p:
                    return
                metrics = await _compute_risk_payload(p, db)
                payload = {
                    "type": "risk_update",
                    **metrics.model_dump(mode="json"),
                }
                await manager.broadcast_to_portfolio(portfolio_id, payload)
        except Exception as e:
            log.error(f"Risk compute error for {portfolio_id}: {e}")
            await manager.send_error(websocket, str(e))

    # Send initial metrics on connect
    await send_metrics()

    # ── Heartbeat loop ────────────────────────────────────────
    async def heartbeat():
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            await send_metrics()

    heartbeat_task = asyncio.create_task(heartbeat())

    try:
        while True:
            # Keep connection alive — client can send {"type": "ping"}
            data = await websocket.receive_json()
            if data.get("type") == "refresh":
                await send_metrics()
    except WebSocketDisconnect:
        log.info(f"WS disconnected: {portfolio_id}")
    except Exception as e:
        log.error(f"WS error: {e}")
    finally:
        heartbeat_task.cancel()
        await manager.disconnect(portfolio_id, websocket)
