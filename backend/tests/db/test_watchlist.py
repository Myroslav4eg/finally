"""Tests for the watchlist repository."""

from app.db import DEFAULT_TICKERS
from app.db.repositories import watchlist


class TestWatchlist:
    """Watchlist CRUD."""

    def test_seeded_tickers(self, db_path):
        assert set(watchlist.list_tickers()) == set(DEFAULT_TICKERS)

    def test_list_watchlist_returns_entries(self, db_path):
        entries = watchlist.list_watchlist()
        assert len(entries) == len(DEFAULT_TICKERS)
        assert all(entry.id and entry.added_at for entry in entries)

    def test_add_ticker(self, db_path):
        entry = watchlist.add_ticker("PYPL")
        assert entry.ticker == "PYPL"
        assert "PYPL" in watchlist.list_tickers()

    def test_add_ticker_normalizes_case_and_whitespace(self, db_path):
        entry = watchlist.add_ticker("  pypl  ")
        assert entry.ticker == "PYPL"

    def test_add_existing_ticker_is_idempotent(self, db_path):
        first = watchlist.add_ticker("AAPL")
        second = watchlist.add_ticker("aapl")
        assert first.id == second.id
        assert watchlist.list_tickers().count("AAPL") == 1

    def test_remove_ticker(self, db_path):
        assert watchlist.remove_ticker("AAPL") is True
        assert "AAPL" not in watchlist.list_tickers()

    def test_remove_missing_ticker_returns_false(self, db_path):
        assert watchlist.remove_ticker("ZZZZ") is False

    def test_remove_is_case_insensitive(self, db_path):
        assert watchlist.remove_ticker("aapl") is True

    def test_has_ticker(self, db_path):
        assert watchlist.has_ticker("AAPL") is True
        assert watchlist.has_ticker("ZZZZ") is False

    def test_get_entry_missing_returns_none(self, db_path):
        assert watchlist.get_entry("ZZZZ") is None

    def test_empty_watchlist(self, db_path):
        for ticker in DEFAULT_TICKERS:
            watchlist.remove_ticker(ticker)
        assert watchlist.list_watchlist() == []
        assert watchlist.list_tickers() == []

    def test_to_dict(self, db_path):
        data = watchlist.add_ticker("PYPL").to_dict()
        assert data["ticker"] == "PYPL"
        assert set(data) == {"id", "user_id", "ticker", "added_at"}
