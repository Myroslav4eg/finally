"""Tests for grouping repository calls in a single transaction."""

import pytest

from app.db import DEFAULT_CASH_BALANCE, transaction
from app.db.repositories import positions, profile, trades


def buy(conn, ticker: str, quantity: float, price: float) -> None:
    """A trade the way the portfolio service will compose it."""
    profile.adjust_cash_balance(-quantity * price, conn=conn)
    positions.upsert_position(ticker, quantity, price, conn=conn)
    trades.record_trade(ticker, "buy", quantity, price, conn=conn)


class TestTransaction:
    """The shared-connection contract."""

    def test_commits_all_writes(self, db_path):
        with transaction() as conn:
            buy(conn, "AAPL", 10.0, 190.0)

        assert profile.get_cash_balance() == DEFAULT_CASH_BALANCE - 1900.0
        assert positions.get_position("AAPL").quantity == 10.0
        assert len(trades.list_trades()) == 1

    def test_rolls_back_all_writes_on_error(self, db_path):
        with pytest.raises(RuntimeError):
            with transaction() as conn:
                buy(conn, "AAPL", 10.0, 190.0)
                raise RuntimeError("price feed died")

        assert profile.get_cash_balance() == DEFAULT_CASH_BALANCE
        assert positions.get_position("AAPL") is None
        assert trades.list_trades() == []

    def test_reads_see_uncommitted_writes_within_the_transaction(self, db_path):
        with transaction() as conn:
            positions.upsert_position("AAPL", 5.0, 190.0, conn=conn)
            assert positions.get_position("AAPL", conn=conn).quantity == 5.0

    def test_without_conn_each_call_commits_independently(self, db_path):
        profile.adjust_cash_balance(-100.0)
        assert profile.get_cash_balance() == DEFAULT_CASH_BALANCE - 100.0
