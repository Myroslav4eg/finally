"""Tests for the trades repository."""

import pytest

from app.db.repositories import trades


class TestRecordTrade:
    """Appending trades."""

    def test_record_buy(self, db_path):
        trade = trades.record_trade("AAPL", "buy", 10.0, 190.0)
        assert trade.ticker == "AAPL"
        assert trade.side == "buy"
        assert trade.quantity == 10.0
        assert trade.price == 190.0
        assert trade.executed_at

    def test_record_sell(self, db_path):
        trade = trades.record_trade("AAPL", "sell", 2.5, 195.0)
        assert trade.side == "sell"
        assert trade.notional == 487.5

    def test_invalid_side_raises(self, db_path):
        with pytest.raises(ValueError, match="side must be"):
            trades.record_trade("AAPL", "hold", 1.0, 190.0)

    def test_ticker_is_normalized(self, db_path):
        trade = trades.record_trade(" aapl ", "buy", 1.0, 190.0)
        assert trade.ticker == "AAPL"

    def test_trade_is_persisted(self, db_path):
        recorded = trades.record_trade("AAPL", "buy", 1.0, 190.0)
        stored = trades.list_trades()[0]
        assert stored == recorded


class TestListTrades:
    """Reading trade history."""

    def test_empty_by_default(self, db_path):
        assert trades.list_trades() == []

    def test_most_recent_first(self, db_path):
        trades.record_trade("AAPL", "buy", 1.0, 190.0)
        trades.record_trade("MSFT", "buy", 1.0, 420.0)
        trades.record_trade("TSLA", "buy", 1.0, 250.0)
        assert [t.ticker for t in trades.list_trades()] == ["TSLA", "MSFT", "AAPL"]

    def test_filter_by_ticker(self, db_path):
        trades.record_trade("AAPL", "buy", 1.0, 190.0)
        trades.record_trade("MSFT", "buy", 1.0, 420.0)
        trades.record_trade("AAPL", "sell", 1.0, 195.0)
        result = trades.list_trades(ticker="aapl")
        assert len(result) == 2
        assert all(t.ticker == "AAPL" for t in result)

    def test_limit(self, db_path):
        for _ in range(5):
            trades.record_trade("AAPL", "buy", 1.0, 190.0)
        assert len(trades.list_trades(limit=2)) == 2

    def test_to_dict_includes_notional(self, db_path):
        data = trades.record_trade("AAPL", "buy", 2.0, 190.0).to_dict()
        assert data["notional"] == 380.0
        assert data["side"] == "buy"
