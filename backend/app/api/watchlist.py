"""Watchlist endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas import WatchlistAddRequest, WatchlistItem, WatchlistResponse
from app.services import watchlist as watchlist_service
from app.state import MarketContext, get_market

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])

Market = Annotated[MarketContext, Depends(get_market)]


@router.get("", response_model=WatchlistResponse)
async def get_watchlist(market: Market) -> WatchlistResponse:
    """Watched tickers with their latest prices."""
    return await watchlist_service.get_watchlist(market)


@router.post("", response_model=WatchlistItem, status_code=status.HTTP_201_CREATED)
async def add_ticker(request: WatchlistAddRequest, market: Market) -> WatchlistItem:
    """Add a ticker to the watchlist and start streaming its price. Idempotent."""
    return await watchlist_service.add_ticker(market, request.ticker)


@router.delete("/{ticker}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_ticker(ticker: str, market: Market) -> None:
    """Remove a ticker from the watchlist and stop streaming its price."""
    removed = await watchlist_service.remove_ticker(market, ticker)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{ticker.upper()} is not on the watchlist",
        )
