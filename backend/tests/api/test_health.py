"""Health endpoint."""


def test_health_reports_the_running_source(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "market_source": "StubSource",
        "tracked_tickers": 0,
    }


def test_health_counts_cached_tickers(client, market):
    market.cache.update("AAPL", 100.0)

    assert client.get("/api/health").json()["tracked_tickers"] == 1
