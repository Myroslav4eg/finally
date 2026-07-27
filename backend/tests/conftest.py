"""Pytest configuration and shared fixtures."""

import pytest
from fastapi.testclient import TestClient

from app.db.config import DB_PATH_ENV_VAR
from app.db.connection import reset_initialization_state
from app.main import create_app
from app.market import MarketDataSource, PriceCache
from app.state import MarketContext


@pytest.fixture
def event_loop_policy():
    """Use the default event loop policy for all async tests."""
    import asyncio

    return asyncio.DefaultEventLoopPolicy()


class StubSource(MarketDataSource):
    """Market data source that tracks tickers but never generates prices.

    Tests write prices into the cache directly, so valuations stay deterministic.
    """

    def __init__(self, cache: PriceCache) -> None:
        self.cache = cache
        self.tickers: list[str] = []
        self.started = False
        self.stopped = False

    async def start(self, tickers: list[str]) -> None:
        self.tickers = list(tickers)
        self.started = True

    async def stop(self) -> None:
        self.stopped = True

    async def add_ticker(self, ticker: str) -> None:
        if ticker not in self.tickers:
            self.tickers.append(ticker)

    async def remove_ticker(self, ticker: str) -> None:
        if ticker in self.tickers:
            self.tickers.remove(ticker)
        self.cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return list(self.tickers)


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    """Point FINALLY_DB_PATH at a fresh temporary database file for each test."""
    path = tmp_path / "test.db"
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(path))
    reset_initialization_state()
    yield path
    reset_initialization_state()


@pytest.fixture
def cache() -> PriceCache:
    """An empty price cache."""
    return PriceCache()


@pytest.fixture
def market(cache: PriceCache) -> MarketContext:
    """A market context backed by the stub source."""
    return MarketContext(cache=cache, source=StubSource(cache))


@pytest.fixture
def client(temp_db, market: MarketContext):
    """A TestClient running the full app lifespan against a temporary database."""
    with TestClient(create_app(market)) as test_client:
        yield test_client
