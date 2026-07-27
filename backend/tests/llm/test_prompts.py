"""Prompt construction: portfolio context, history ordering, and message shape."""

import pytest

from app.db.models import ChatMessage
from app.llm import SYSTEM_PROMPT, build_messages, format_portfolio_context
from app.llm.prompts import history_to_messages
from app.schemas import Portfolio, PositionValue, WatchlistItem, WatchlistResponse

pytestmark = pytest.mark.usefixtures("temp_db")


def make_portfolio(positions=()):
    return Portfolio(
        cash_balance=8000.0,
        positions=list(positions),
        positions_value=2500.0,
        total_value=10500.0,
        unrealized_pnl=500.0,
        unrealized_pnl_percent=5.0,
    )


def make_position():
    return PositionValue(
        ticker="AAPL",
        quantity=10.0,
        avg_cost=200.0,
        cost_basis=2000.0,
        current_price=250.0,
        market_value=2500.0,
        unrealized_pnl=500.0,
        unrealized_pnl_percent=25.0,
        weight=100.0,
    )


def make_watchlist():
    return WatchlistResponse(
        items=[
            WatchlistItem(
                ticker="AAPL",
                added_at="2026-01-01T00:00:00+00:00",
                price=250.0,
                previous_price=249.0,
                change=1.0,
                change_percent=0.4,
                direction="up",
            )
        ]
    )


def make_message(role: str, content: str) -> ChatMessage:
    return ChatMessage(
        id="1",
        user_id="default",
        role=role,
        content=content,
        actions=None,
        created_at="2026-01-01T00:00:00+00:00",
    )


def test_context_includes_cash_positions_and_watchlist():
    context = format_portfolio_context(make_portfolio([make_position()]), make_watchlist())

    assert "$8,000.00" in context
    assert "$10,500.00" in context
    assert "+5.00%" in context
    assert "AAPL" in context
    assert "$250.00" in context
    assert "WATCHLIST" in context


def test_context_handles_empty_portfolio_and_watchlist():
    context = format_portfolio_context(make_portfolio(), WatchlistResponse(items=[]))

    assert "No open positions." in context
    assert "Watchlist is empty." in context


def test_context_handles_missing_price():
    position = make_position().model_copy(update={"current_price": None})
    item = make_watchlist().items[0].model_copy(update={"price": None, "change_percent": None})

    context = format_portfolio_context(
        make_portfolio([position]), WatchlistResponse(items=[item])
    )

    assert "n/a" in context
    assert "no price yet" in context


def test_history_is_converted_in_order():
    history = [make_message("user", "hello"), make_message("assistant", "hi")]

    assert history_to_messages(history) == [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi"},
    ]


def test_build_messages_shape():
    history = [make_message("user", "earlier"), make_message("assistant", "reply")]

    messages = build_messages(make_portfolio(), make_watchlist(), history, "what now?")

    assert messages[0]["role"] == "system"
    assert SYSTEM_PROMPT in messages[0]["content"]
    assert "CURRENT PORTFOLIO" in messages[0]["content"]
    assert [m["role"] for m in messages] == ["system", "user", "assistant", "user"]
    assert messages[-1] == {"role": "user", "content": "what now?"}


def test_build_messages_without_history():
    messages = build_messages(make_portfolio(), make_watchlist(), [], "hi")

    assert len(messages) == 2
