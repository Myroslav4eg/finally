"""POST /api/chat wiring, including error mapping and mock mode end to end."""

import pytest
from fastapi.testclient import TestClient

from app.llm import AssistantResponse, LLMError, ProposedTrade
from app.main import create_app

from .conftest import StubClient


@pytest.fixture
def chat_client(temp_db, priced_market):
    """Factory building a TestClient whose LLM client is injected."""

    def build(*responses):
        return TestClient(create_app(priced_market, StubClient(*responses)))

    return build


def test_chat_returns_message_and_empty_actions(chat_client):
    with chat_client(AssistantResponse(message="All good.")) as client:
        response = client.post("/api/chat", json={"message": "how am I doing?"})

    assert response.status_code == 200
    body = response.json()
    assert body["message"] == "All good."
    assert body["actions"] == {"trades": [], "watchlist_changes": []}
    assert body["created_at"]


def test_chat_reports_an_executed_trade(chat_client):
    reply = AssistantResponse(
        message="Bought.", trades=[ProposedTrade(ticker="AAPL", side="buy", quantity=2)]
    )
    with chat_client(reply) as client:
        body = client.post("/api/chat", json={"message": "buy 2 AAPL"}).json()
        portfolio = client.get("/api/portfolio").json()

    assert body["actions"]["trades"][0] == {
        "ticker": "AAPL",
        "side": "buy",
        "quantity": 2.0,
        "status": "executed",
        "price": 100.0,
        "error": None,
    }
    assert portfolio["cash_balance"] == 9800.0


def test_chat_reports_a_failed_trade_with_status_200(chat_client):
    reply = AssistantResponse(
        message="Trying.", trades=[ProposedTrade(ticker="AAPL", side="buy", quantity=9999)]
    )
    with chat_client(reply) as client:
        response = client.post("/api/chat", json={"message": "buy everything"})

    assert response.status_code == 200
    assert response.json()["actions"]["trades"][0]["status"] == "failed"


def test_llm_error_maps_to_502(chat_client):
    with chat_client(LLMError("model unavailable")) as client:
        response = client.post("/api/chat", json={"message": "hi"})

    assert response.status_code == 502
    assert response.json()["detail"] == "model unavailable"


def test_missing_message_is_a_422(chat_client):
    with chat_client(AssistantResponse(message="x")) as client:
        assert client.post("/api/chat", json={}).status_code == 422


def test_mock_mode_drives_the_endpoint(temp_db, priced_market, monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "true")

    with TestClient(create_app(priced_market)) as client:
        analysis = client.post("/api/chat", json={"message": "How is my portfolio?"}).json()
        bought = client.post("/api/chat", json={"message": "Buy 3 AAPL"}).json()
        watched = client.post("/api/chat", json={"message": "Add PYPL to my watchlist"}).json()
        tickers = [item["ticker"] for item in client.get("/api/watchlist").json()["items"]]

    assert analysis["actions"] == {"trades": [], "watchlist_changes": []}
    assert bought["actions"]["trades"][0]["status"] == "executed"
    assert bought["actions"]["trades"][0]["quantity"] == 3.0
    assert watched["actions"]["watchlist_changes"][0]["status"] == "executed"
    assert "PYPL" in tickers
