"""Watchlist reads and mutations, kept in step with the market data source."""

from __future__ import annotations

import asyncio

from app.db import DEFAULT_USER_ID, WatchlistEntry
from app.db.repositories import watchlist as watchlist_repo
from app.market import PriceCache
from app.schemas import WatchlistItem, WatchlistResponse
from app.state import MarketContext

from .tickers import normalize_ticker


def _to_item(entry: WatchlistEntry, cache: PriceCache) -> WatchlistItem:
    """Combine a watchlist row with its latest cached price, if there is one."""
    update = cache.get(entry.ticker)
    return WatchlistItem(
        ticker=entry.ticker,
        added_at=entry.added_at,
        price=update.price if update else None,
        previous_price=update.previous_price if update else None,
        change=update.change if update else None,
        change_percent=update.change_percent if update else None,
        direction=update.direction if update else None,
    )


def build_watchlist(cache: PriceCache, user_id: str = DEFAULT_USER_ID) -> WatchlistResponse:
    """Load the watchlist with current prices. Synchronous."""
    entries = watchlist_repo.list_watchlist(user_id=user_id)
    return WatchlistResponse(items=[_to_item(entry, cache) for entry in entries])


async def get_watchlist(market: MarketContext, user_id: str = DEFAULT_USER_ID) -> WatchlistResponse:
    """Async wrapper over build_watchlist for use in request handlers."""
    return await asyncio.to_thread(build_watchlist, market.cache, user_id)


async def add_ticker(
    market: MarketContext,
    ticker: str,
    user_id: str = DEFAULT_USER_ID,
) -> WatchlistItem:
    """Add a ticker to the watchlist and start tracking its price.

    Idempotent: adding a ticker already watched returns the existing entry.
    Raises ServiceError for an invalid symbol.
    """
    symbol = normalize_ticker(ticker)
    entry = await asyncio.to_thread(watchlist_repo.add_ticker, symbol, user_id)
    await market.source.add_ticker(symbol)
    return _to_item(entry, market.cache)


async def remove_ticker(
    market: MarketContext,
    ticker: str,
    user_id: str = DEFAULT_USER_ID,
) -> bool:
    """Remove a ticker from the watchlist and stop tracking it.

    Returns False when the ticker was not on the watchlist.
    """
    symbol = normalize_ticker(ticker)
    removed = await asyncio.to_thread(watchlist_repo.remove_ticker, symbol, user_id)
    if removed:
        await market.source.remove_ticker(symbol)
    return removed
