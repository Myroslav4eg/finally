"""Portfolio valuation and P&L math."""

import pytest

from app.db.repositories import positions as positions_repo
from app.db.repositories import snapshots as snapshots_repo
from app.services.portfolio import build_history, build_portfolio, record_snapshot

pytestmark = pytest.mark.usefixtures("temp_db")


def test_fresh_portfolio_is_all_cash(cache):
    portfolio = build_portfolio(cache)

    assert portfolio.cash_balance == 10000.0
    assert portfolio.positions == []
    assert portfolio.positions_value == 0.0
    assert portfolio.total_value == 10000.0
    assert portfolio.unrealized_pnl == 0.0
    assert portfolio.unrealized_pnl_percent == 0.0


def test_position_valued_at_cached_price(cache):
    positions_repo.upsert_position("AAPL", 10.0, 100.0)
    cache.update("AAPL", 110.0)

    portfolio = build_portfolio(cache)
    position = portfolio.positions[0]

    assert position.current_price == 110.0
    assert position.cost_basis == 1000.0
    assert position.market_value == 1100.0
    assert position.unrealized_pnl == 100.0
    assert position.unrealized_pnl_percent == 10.0
    assert position.weight == 100.0
    assert portfolio.total_value == 11100.0


def test_losing_position_reports_negative_pnl(cache):
    positions_repo.upsert_position("TSLA", 4.0, 250.0)
    cache.update("TSLA", 200.0)

    position = build_portfolio(cache).positions[0]

    assert position.unrealized_pnl == -200.0
    assert position.unrealized_pnl_percent == -20.0


def test_untracked_ticker_falls_back_to_average_cost(cache):
    positions_repo.upsert_position("ZZZ", 2.0, 50.0)

    position = build_portfolio(cache).positions[0]

    assert position.current_price is None
    assert position.market_value == 100.0
    assert position.unrealized_pnl == 0.0


def test_weights_sum_across_positions(cache):
    positions_repo.upsert_position("AAPL", 10.0, 100.0)
    positions_repo.upsert_position("MSFT", 10.0, 100.0)
    cache.update("AAPL", 150.0)
    cache.update("MSFT", 50.0)

    weights = {p.ticker: p.weight for p in build_portfolio(cache).positions}

    assert weights == {"AAPL": 75.0, "MSFT": 25.0}


def test_fractional_quantities_are_valued(cache):
    positions_repo.upsert_position("NVDA", 0.5, 100.0)
    cache.update("NVDA", 120.0)

    position = build_portfolio(cache).positions[0]

    assert position.quantity == 0.5
    assert position.market_value == 60.0
    assert position.unrealized_pnl == 10.0


def test_record_snapshot_writes_total_value(cache):
    positions_repo.upsert_position("AAPL", 1.0, 100.0)
    cache.update("AAPL", 200.0)

    total = record_snapshot(cache)

    assert total == 10200.0
    assert snapshots_repo.latest_snapshot().total_value == 10200.0


def test_history_is_oldest_first_and_limited(cache):
    for value in (100.0, 200.0, 300.0):
        snapshots_repo.record_snapshot(value)

    assert [s.total_value for s in build_history().snapshots] == [100.0, 200.0, 300.0]
    assert [s.total_value for s in build_history(limit=2).snapshots] == [200.0, 300.0]


def test_history_is_empty_on_a_fresh_database():
    assert build_history().snapshots == []
