"""Application wiring: lifespan, routing precedence, and static serving."""

from fastapi.testclient import TestClient

from app.db.repositories import watchlist as watchlist_repo
from app.main import create_app, static_dir


def test_lifespan_starts_and_stops_the_market_source(temp_db, market):
    with TestClient(create_app(market)):
        assert market.source.started is True
        assert market.source.get_tickers() == watchlist_repo.list_tickers()

    assert market.source.stopped is True


def test_unknown_api_path_returns_json_not_static(client):
    response = client.get("/api/does-not-exist")

    assert response.status_code == 404
    assert response.json()["detail"] == "No such API endpoint: /api/does-not-exist"


def test_unknown_api_post_does_not_fall_through(client):
    assert client.post("/api/does-not-exist", json={}).status_code == 404


def test_stream_route_is_mounted(client):
    routes = {route.path for route in client.app.routes}

    assert "/api/stream/prices" in routes


def test_static_dir_is_configurable(monkeypatch, tmp_path):
    monkeypatch.setenv("FINALLY_STATIC_DIR", str(tmp_path))

    assert static_dir() == tmp_path


def test_static_index_is_served_when_present(temp_db, market, monkeypatch, tmp_path):
    (tmp_path / "index.html").write_text("<html>FinAlly</html>")
    monkeypatch.setenv("FINALLY_STATIC_DIR", str(tmp_path))

    with TestClient(create_app(market)) as client:
        assert "FinAlly" in client.get("/").text
        assert client.get("/api/health").status_code == 200
