"""Trade execution and its validation rules."""

import pytest

from app.db.repositories import positions as positions_repo
from app.db.repositories import profile as profile_repo
from app.db.repositories import snapshots as snapshots_repo
from app.db.repositories import trades as trades_repo
from app.services.errors import ServiceError
from app.services.trading import execute_trade, execute_trade_sync

pytestmark = pytest.mark.usefixtures("temp_db")


@pytest.fixture
def priced_cache(cache):
    """A cache with a single deterministic price."""
    cache.update("AAPL", 100.0)
    return cache


def test_buy_debits_cash_and_creates_position(priced_cache):
    result = execute_trade_sync(priced_cache, "AAPL", "buy", 10)

    assert result.trade.price == 100.0
    assert result.trade.notional == 1000.0
    assert result.cash_balance == 9000.0
    assert result.position.quantity == 10.0
    assert profile_repo.get_cash_balance() == 9000.0
    assert positions_repo.get_position("AAPL").quantity == 10.0


def test_buy_is_logged_and_snapshotted(priced_cache):
    execute_trade_sync(priced_cache, "AAPL", "buy", 1)

    logged = trades_repo.list_trades()
    assert len(logged) == 1
    assert (logged[0].ticker, logged[0].side, logged[0].quantity) == ("AAPL", "buy", 1.0)
    assert snapshots_repo.latest_snapshot().total_value == 10000.0


def test_repeat_buys_update_weighted_average_cost(priced_cache):
    execute_trade_sync(priced_cache, "AAPL", "buy", 10)
    priced_cache.update("AAPL", 200.0)
    execute_trade_sync(priced_cache, "AAPL", "buy", 10)

    position = positions_repo.get_position("AAPL")
    assert position.quantity == 20.0
    assert position.avg_cost == pytest.approx(150.0)


def test_selling_does_not_change_average_cost(priced_cache):
    execute_trade_sync(priced_cache, "AAPL", "buy", 10)
    priced_cache.update("AAPL", 300.0)
    execute_trade_sync(priced_cache, "AAPL", "sell", 4)

    position = positions_repo.get_position("AAPL")
    assert position.quantity == 6.0
    assert position.avg_cost == pytest.approx(100.0)
    assert profile_repo.get_cash_balance() == pytest.approx(10200.0)


def test_full_sell_removes_the_position(priced_cache):
    execute_trade_sync(priced_cache, "AAPL", "buy", 5)
    result = execute_trade_sync(priced_cache, "AAPL", "sell", 5)

    assert positions_repo.get_position("AAPL") is None
    assert result.position is None
    assert result.cash_balance == 10000.0


def test_fractional_quantities_are_supported(priced_cache):
    result = execute_trade_sync(priced_cache, "AAPL", "buy", 2.5)

    assert result.trade.quantity == 2.5
    assert result.cash_balance == 9750.0
    assert positions_repo.get_position("AAPL").quantity == 2.5


def test_ticker_is_normalized(priced_cache):
    result = execute_trade_sync(priced_cache, " aapl ", "buy", 1)

    assert result.trade.ticker == "AAPL"


def test_insufficient_cash_is_rejected(priced_cache):
    with pytest.raises(ServiceError, match="Insufficient cash"):
        execute_trade_sync(priced_cache, "AAPL", "buy", 101)

    assert profile_repo.get_cash_balance() == 10000.0
    assert positions_repo.list_positions() == []


def test_overselling_is_rejected(priced_cache):
    execute_trade_sync(priced_cache, "AAPL", "buy", 5)

    with pytest.raises(ServiceError, match="Insufficient shares"):
        execute_trade_sync(priced_cache, "AAPL", "sell", 6)

    assert positions_repo.get_position("AAPL").quantity == 5.0
    assert profile_repo.get_cash_balance() == 9500.0


def test_selling_an_unheld_position_is_rejected(priced_cache):
    with pytest.raises(ServiceError, match="Insufficient shares"):
        execute_trade_sync(priced_cache, "AAPL", "sell", 1)


def test_ticker_without_a_cached_price_is_rejected(cache):
    with pytest.raises(ServiceError, match="No price available for MSFT"):
        execute_trade_sync(cache, "MSFT", "buy", 1)


def test_unknown_ticker_symbol_is_rejected(priced_cache):
    with pytest.raises(ServiceError, match="Invalid ticker"):
        execute_trade_sync(priced_cache, "", "buy", 1)


@pytest.mark.parametrize("quantity", [0, -5, -0.1])
def test_non_positive_quantity_is_rejected(priced_cache, quantity):
    with pytest.raises(ServiceError, match="greater than zero"):
        execute_trade_sync(priced_cache, "AAPL", "buy", quantity)


def test_invalid_side_is_rejected(priced_cache):
    with pytest.raises(ServiceError, match="Invalid side"):
        execute_trade_sync(priced_cache, "AAPL", "short", 1)


def test_rejected_trade_writes_nothing(priced_cache):
    with pytest.raises(ServiceError):
        execute_trade_sync(priced_cache, "AAPL", "buy", 1000)

    assert trades_repo.list_trades() == []
    assert snapshots_repo.latest_snapshot() is None


async def test_async_wrapper_executes_the_same_trade(market):
    market.cache.update("AAPL", 100.0)

    result = await execute_trade(market, "AAPL", "buy", 3)

    assert result.cash_balance == 9700.0
    assert result.position.quantity == 3.0
