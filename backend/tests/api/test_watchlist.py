"""Watchlist endpoints."""

DEFAULT_TICKERS = {"AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"}


def test_get_returns_the_seeded_watchlist(client):
    response = client.get("/api/watchlist")

    assert response.status_code == 200
    items = response.json()["items"]
    assert {item["ticker"] for item in items} == DEFAULT_TICKERS
    assert items[0]["price"] is None


def test_get_includes_cached_prices(client, market):
    market.cache.update("AAPL", 190.0)
    market.cache.update("AAPL", 191.0)

    item = next(i for i in client.get("/api/watchlist").json()["items"] if i["ticker"] == "AAPL")

    assert item["price"] == 191.0
    assert item["previous_price"] == 190.0
    assert item["direction"] == "up"
    assert item["change"] == 1.0


def test_post_adds_a_ticker(client, market):
    response = client.post("/api/watchlist", json={"ticker": "pypl"})

    assert response.status_code == 201
    assert response.json()["ticker"] == "PYPL"
    assert "PYPL" in market.source.get_tickers()


def test_post_is_idempotent(client):
    client.post("/api/watchlist", json={"ticker": "PYPL"})
    client.post("/api/watchlist", json={"ticker": "PYPL"})

    tickers = [item["ticker"] for item in client.get("/api/watchlist").json()["items"]]
    assert tickers.count("PYPL") == 1


def test_post_rejects_an_invalid_symbol(client):
    response = client.post("/api/watchlist", json={"ticker": "!!"})

    assert response.status_code == 400
    assert "Invalid ticker" in response.json()["detail"]


def test_post_requires_a_ticker(client):
    assert client.post("/api/watchlist", json={}).status_code == 422


def test_delete_removes_a_ticker(client, market):
    market.cache.update("AAPL", 190.0)

    assert client.delete("/api/watchlist/aapl").status_code == 204

    tickers = [item["ticker"] for item in client.get("/api/watchlist").json()["items"]]
    assert "AAPL" not in tickers
    assert "AAPL" not in market.source.get_tickers()
    assert market.cache.get("AAPL") is None


def test_delete_unknown_ticker_is_a_404(client):
    response = client.delete("/api/watchlist/PYPL")

    assert response.status_code == 404
    assert "not on the watchlist" in response.json()["detail"]


def test_delete_invalid_symbol_is_a_400(client):
    assert client.delete("/api/watchlist/!!").status_code == 400
