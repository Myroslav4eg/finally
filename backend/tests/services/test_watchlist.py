"""Watchlist service behavior, including market data source sync."""

import pytest

from app.db.repositories import watchlist as watchlist_repo
from app.services.errors import ServiceError
from app.services.watchlist import add_ticker, get_watchlist, remove_ticker

pytestmark = pytest.mark.usefixtures("temp_db")


async def test_default_watchlist_has_ten_tickers(market):
    response = await get_watchlist(market)

    assert len(response.items) == 10
    assert response.items[0].ticker == "AAPL"


async def test_items_without_a_cached_price_report_none(market):
    item = (await get_watchlist(market)).items[0]

    assert item.price is None
    assert item.direction is None


async def test_items_carry_cached_price_details(market):
    market.cache.update("AAPL", 100.0)
    market.cache.update("AAPL", 110.0)

    item = next(i for i in (await get_watchlist(market)).items if i.ticker == "AAPL")

    assert item.price == 110.0
    assert item.previous_price == 100.0
    assert item.direction == "up"


async def test_add_ticker_persists_and_tracks_it(market):
    item = await add_ticker(market, "pypl")

    assert item.ticker == "PYPL"
    assert watchlist_repo.has_ticker("PYPL")
    assert "PYPL" in market.source.get_tickers()


async def test_add_ticker_is_idempotent(market):
    await add_ticker(market, "PYPL")
    await add_ticker(market, "PYPL")

    tickers = watchlist_repo.list_tickers()
    assert tickers.count("PYPL") == 1


async def test_add_rejects_an_invalid_symbol(market):
    with pytest.raises(ServiceError, match="Invalid ticker"):
        await add_ticker(market, "123!")


async def test_remove_ticker_untracks_and_clears_the_cache(market):
    await add_ticker(market, "PYPL")
    market.cache.update("PYPL", 70.0)

    assert await remove_ticker(market, "pypl") is True
    assert not watchlist_repo.has_ticker("PYPL")
    assert "PYPL" not in market.source.get_tickers()
    assert market.cache.get("PYPL") is None


async def test_remove_unwatched_ticker_returns_false(market):
    assert await remove_ticker(market, "PYPL") is False
