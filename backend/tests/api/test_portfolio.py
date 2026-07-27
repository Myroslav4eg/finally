"""Portfolio, trade, and history endpoints."""

import pytest


@pytest.fixture
def priced_client(client, market):
    """A client whose cache holds a deterministic AAPL price."""
    market.cache.update("AAPL", 100.0)
    return client


def buy(client, quantity=10, ticker="AAPL"):
    """Post a buy order and return the response."""
    return client.post(
        "/api/portfolio/trade", json={"ticker": ticker, "quantity": quantity, "side": "buy"}
    )


def test_fresh_portfolio_shape(client):
    response = client.get("/api/portfolio")

    assert response.status_code == 200
    assert response.json() == {
        "cash_balance": 10000.0,
        "positions": [],
        "positions_value": 0.0,
        "total_value": 10000.0,
        "unrealized_pnl": 0.0,
        "unrealized_pnl_percent": 0.0,
    }


def test_portfolio_lists_positions_with_live_prices(priced_client, market):
    buy(priced_client, 5)
    market.cache.update("AAPL", 120.0)

    position = priced_client.get("/api/portfolio").json()["positions"][0]

    assert position["ticker"] == "AAPL"
    assert position["quantity"] == 5.0
    assert position["avg_cost"] == 100.0
    assert position["current_price"] == 120.0
    assert position["unrealized_pnl"] == 100.0
    assert position["unrealized_pnl_percent"] == 20.0
    assert position["weight"] == 100.0


def test_buy_returns_the_execution(priced_client):
    response = buy(priced_client, 3)

    assert response.status_code == 200
    body = response.json()
    assert body["trade"]["side"] == "buy"
    assert body["trade"]["price"] == 100.0
    assert body["trade"]["notional"] == 300.0
    assert body["cash_balance"] == 9700.0
    assert body["position"]["quantity"] == 3.0


def test_sell_returns_cash_and_clears_the_position(priced_client):
    buy(priced_client, 2)

    response = priced_client.post(
        "/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 2, "side": "sell"}
    )

    assert response.status_code == 200
    assert response.json()["position"] is None
    assert response.json()["cash_balance"] == 10000.0


def test_insufficient_cash_is_a_400(priced_client):
    response = buy(priced_client, 1000)

    assert response.status_code == 400
    assert "Insufficient cash" in response.json()["detail"]


def test_overselling_is_a_400(priced_client):
    buy(priced_client, 1)

    response = priced_client.post(
        "/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 2, "side": "sell"}
    )

    assert response.status_code == 400
    assert "Insufficient shares" in response.json()["detail"]


def test_ticker_without_a_price_is_a_400(client):
    response = buy(client, 1, ticker="MSFT")

    assert response.status_code == 400
    assert "No price available" in response.json()["detail"]


@pytest.mark.parametrize("quantity", [0, -1])
def test_non_positive_quantity_is_a_400(priced_client, quantity):
    response = buy(priced_client, quantity)

    assert response.status_code == 400
    assert "greater than zero" in response.json()["detail"]


def test_fractional_quantity_fills(priced_client):
    response = buy(priced_client, 0.25)

    assert response.status_code == 200
    assert response.json()["cash_balance"] == 9975.0


def test_invalid_side_is_a_422(priced_client):
    response = priced_client.post(
        "/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1, "side": "hold"}
    )

    assert response.status_code == 422


def test_missing_fields_are_a_422(client):
    assert client.post("/api/portfolio/trade", json={"ticker": "AAPL"}).status_code == 422


def test_history_starts_empty_and_grows_with_trades(priced_client):
    assert priced_client.get("/api/portfolio/history").json() == {"snapshots": []}

    buy(priced_client, 1)
    snapshots = priced_client.get("/api/portfolio/history").json()["snapshots"]

    assert len(snapshots) == 1
    assert snapshots[0]["total_value"] == 10000.0
    assert snapshots[0]["recorded_at"]


def test_history_limit_is_validated(client):
    assert client.get("/api/portfolio/history", params={"limit": 0}).status_code == 422
    assert client.get("/api/portfolio/history", params={"limit": 5}).status_code == 200
