"""The LLM_MOCK trigger contract documented in planning/LLM_MOCK.md."""

import pytest

from app.llm import LiteLLMClient, MockLLMClient, ProposedTrade, create_client, mock_enabled
from app.llm.mock import ANALYSIS_MESSAGE, mock_response


def user(text: str) -> list[dict[str, str]]:
    return [{"role": "system", "content": "context"}, {"role": "user", "content": text}]


async def test_plain_question_returns_analysis_only():
    response = await MockLLMClient().complete(user("How is my portfolio doing?"))

    assert response.message == ANALYSIS_MESSAGE
    assert response.trades == []
    assert response.watchlist_changes == []


async def test_buy_trigger_returns_a_buy():
    response = await MockLLMClient().complete(user("Buy 5 AAPL please"))

    assert response.trades == [ProposedTrade(ticker="AAPL", side="buy", quantity=5.0)]
    assert "buy" in response.message
    assert response.watchlist_changes == []


async def test_sell_trigger_returns_a_sell():
    response = await MockLLMClient().complete(user("Sell 2 MSFT"))

    trade = response.trades[0]
    assert (trade.ticker, trade.side, trade.quantity) == ("MSFT", "sell", 2.0)


async def test_watchlist_trigger_adds_a_ticker():
    response = await MockLLMClient().complete(user("Add PYPL to my watchlist"))

    change = response.watchlist_changes[0]
    assert (change.ticker, change.action) == ("PYPL", "add")
    assert response.trades == []


async def test_watchlist_remove_trigger():
    response = await MockLLMClient().complete(user("Remove NFLX from my watchlist"))

    change = response.watchlist_changes[0]
    assert (change.ticker, change.action) == ("NFLX", "remove")


def test_defaults_when_no_ticker_or_quantity():
    response = mock_response("buy something")

    assert response.trades[0].ticker == "AAPL"
    assert response.trades[0].quantity == 1.0


def test_buy_wins_over_watchlist_keyword():
    response = mock_response("Buy 3 TSLA and add it to my watchlist")

    assert response.trades[0].ticker == "TSLA"
    assert response.watchlist_changes == []


def test_fractional_quantity_is_parsed():
    assert mock_response("buy 0.25 NVDA").trades[0].quantity == 0.25


def test_mock_is_deterministic():
    assert mock_response("Buy 5 AAPL") == mock_response("Buy 5 AAPL")


async def test_no_user_message_returns_analysis():
    response = await MockLLMClient().complete([{"role": "system", "content": "context"}])

    assert response.message == ANALYSIS_MESSAGE


@pytest.mark.parametrize("value,expected", [("true", True), ("TRUE", True), ("false", False)])
def test_mock_enabled_reads_env(monkeypatch, value, expected):
    monkeypatch.setenv("LLM_MOCK", value)

    assert mock_enabled() is expected


def test_mock_disabled_by_default(monkeypatch):
    monkeypatch.delenv("LLM_MOCK", raising=False)

    assert mock_enabled() is False


def test_create_client_honours_the_flag(monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "true")
    assert isinstance(create_client(), MockLLMClient)

    monkeypatch.setenv("LLM_MOCK", "false")
    assert isinstance(create_client(), LiteLLMClient)
