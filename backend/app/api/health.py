"""Health check endpoint."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.schemas import HealthResponse
from app.state import MarketContext, get_market

router = APIRouter(prefix="/api", tags=["system"])

Market = Annotated[MarketContext, Depends(get_market)]


@router.get("/health", response_model=HealthResponse)
async def health(market: Market) -> HealthResponse:
    """Report liveness and which market data source is running."""
    return HealthResponse(
        status="ok",
        market_source=type(market.source).__name__,
        tracked_tickers=len(market.cache),
    )
