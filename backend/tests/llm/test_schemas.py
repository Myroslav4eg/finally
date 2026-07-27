"""Structured output parsing: valid shapes, optional arrays, and malformed JSON."""

import pytest

from app.llm import AssistantResponse, ChatActions, LLMError, TradeOutcome, parse_response


def test_parses_message_only():
    response = parse_response('{"message": "Your portfolio is fine."}')

    assert response.message == "Your portfolio is fine."
    assert response.trades == []
    assert response.watchlist_changes == []


def test_parses_explicit_empty_arrays():
    response = parse_response('{"message": "hi", "trades": [], "watchlist_changes": []}')

    assert response.trades == []
    assert response.watchlist_changes == []


def test_parses_trades_and_watchlist_changes():
    content = """
    {
      "message": "Buying and watching.",
      "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 10}],
      "watchlist_changes": [{"ticker": "PYPL", "action": "add"}]
    }
    """
    response = parse_response(content)

    assert response.trades[0].ticker == "AAPL"
    assert response.trades[0].side == "buy"
    assert response.trades[0].quantity == 10.0
    assert response.watchlist_changes[0].ticker == "PYPL"
    assert response.watchlist_changes[0].action == "add"


def test_parses_fractional_quantity():
    content = '{"message": "x", "trades": [{"ticker": "AAPL", "side": "sell", "quantity": 0.5}]}'

    assert parse_response(content).trades[0].quantity == 0.5


@pytest.mark.parametrize(
    "content",
    [
        "not json at all",
        "{",
        '{"trades": []}',
        '{"message": "x", "trades": [{"ticker": "AAPL", "side": "hold", "quantity": 1}]}',
        '{"message": "x", "watchlist_changes": [{"ticker": "AAPL", "action": "buy"}]}',
        "[]",
    ],
)
def test_malformed_response_raises_llm_error(content):
    with pytest.raises(LLMError):
        parse_response(content)


@pytest.mark.parametrize("content", [None, ""])
def test_empty_response_raises_llm_error(content):
    with pytest.raises(LLMError, match="empty"):
        parse_response(content)


def test_assistant_response_defaults_are_independent():
    first = AssistantResponse(message="a")
    first.trades.append("marker")

    assert AssistantResponse(message="b").trades == []


def test_chat_actions_is_empty():
    assert ChatActions().is_empty
    assert not ChatActions(
        trades=[TradeOutcome(ticker="AAPL", side="buy", quantity=1, status="executed")]
    ).is_empty
