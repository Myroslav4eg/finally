"""Background task recording portfolio value on a fixed interval."""

from __future__ import annotations

import asyncio
import logging

from app.db import DEFAULT_USER_ID
from app.state import MarketContext

from .portfolio import record_snapshot

logger = logging.getLogger(__name__)

SNAPSHOT_INTERVAL = 30.0


async def run_snapshot_loop(
    market: MarketContext,
    interval: float = SNAPSHOT_INTERVAL,
    user_id: str = DEFAULT_USER_ID,
) -> None:
    """Record a portfolio snapshot every `interval` seconds until cancelled."""
    while True:
        await asyncio.sleep(interval)
        try:
            await asyncio.to_thread(record_snapshot, market.cache, user_id)
        except Exception:
            logger.exception("Portfolio snapshot failed")
