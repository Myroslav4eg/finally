"""The chat turn: action execution, failure reporting, and persistence."""

import pytest

from app.db.repositories import chat as chat_repo
from app.db.repositories import positions as positions_repo
from app.db.repositories import profile as profile_repo
from app.db.repositories import watchlist as watchlist_repo
from app.llm import AssistantResponse, LLMError, ProposedTrade, ProposedWatchlistChange, run_chat
from app.llm.prompts import HISTORY_LIMIT

from .conftest import StubClient

pytestmark = pytest.mark.usefixtures("temp_db")


def analysis(text="Looks fine.") -> AssistantResponse:
    return AssistantResponse(message=text)


async def test_conversation_only_turn_persists_without_actions(priced_market, stub_client):
    client = stub_client(analysis("Your cash is idle."))

    result = await run_chat(priced_market, client, "How am I doing?")

    assert result.message == "Your cash is idle."
    assert result.actions.is_empty
    stored = chat_repo.list_messages()
    assert [(m.role, m.content) for m in stored] == [
        ("user", "How am I doing?"),
        ("assistant", "Your cash is idle."),
    ]
    assert stored[1].actions is None


async def test_buy_is_executed_and_reported(priced_market, stub_client):
    client = stub_client(
        AssistantResponse(
            message="Buying 10 AAPL.",
            trades=[ProposedTrade(ticker="AAPL", side="buy", quantity=10)],
        )
    )

    result = await run_chat(priced_market, client, "buy 10 AAPL")

    trade = result.actions.trades[0]
    assert (trade.ticker, trade.side, trade.quantity, trade.status) == ("AAPL", "buy", 10.0, "executed")
    assert trade.price == 100.0
    assert trade.error is None
    assert profile_repo.get_cash_balance() == 9000.0
    assert positions_repo.get_position("AAPL").quantity == 10.0


async def test_actions_are_stored_on_the_assistant_message(priced_market, stub_client):
    client = stub_client(
        AssistantResponse(
            message="Done.", trades=[ProposedTrade(ticker="AAPL", side="buy", quantity=1)]
        )
    )

    await run_chat(priced_market, client, "buy")

    stored = chat_repo.list_messages()[-1]
    assert stored.actions["trades"][0]["status"] == "executed"
    assert stored.actions["watchlist_changes"] == []


async def test_failed_trade_is_reported_not_raised(priced_market, stub_client):
    client = stub_client(
        AssistantResponse(
            message="Buying a lot.",
            trades=[ProposedTrade(ticker="AAPL", side="buy", quantity=1000)],
        )
    )

    result = await run_chat(priced_market, client, "buy 1000 AAPL")

    trade = result.actions.trades[0]
    assert trade.status == "failed"
    assert "Insufficient cash" in trade.error
    assert profile_repo.get_cash_balance() == 10000.0


async def test_unpriced_ticker_trade_fails_gracefully(priced_market, stub_client):
    client = stub_client(
        AssistantResponse(
            message="Buying.", trades=[ProposedTrade(ticker="ZZZZ", side="buy", quantity=1)]
        )
    )

    result = await run_chat(priced_market, client, "buy ZZZZ")

    assert result.actions.trades[0].status == "failed"
    assert "No price available" in result.actions.trades[0].error


async def test_invalid_ticker_trade_fails_gracefully(priced_market, stub_client):
    client = stub_client(
        AssistantResponse(
            message="Buying.", trades=[ProposedTrade(ticker="123!", side="buy", quantity=1)]
        )
    )

    result = await run_chat(priced_market, client, "buy nonsense")

    assert result.actions.trades[0].status == "failed"
    assert "Invalid ticker" in result.actions.trades[0].error


async def test_mixed_trades_report_each_outcome(priced_market, stub_client):
    client = stub_client(
        AssistantResponse(
            message="Two trades.",
            trades=[
                ProposedTrade(ticker="AAPL", side="buy", quantity=1),
                ProposedTrade(ticker="MSFT", side="sell", quantity=5),
            ],
        )
    )

    result = await run_chat(priced_market, client, "trade")

    assert [t.status for t in result.actions.trades] == ["executed", "failed"]
    assert "Insufficient shares" in result.actions.trades[1].error


async def test_watchlist_add_is_executed(priced_market, stub_client):
    client = stub_client(
        AssistantResponse(
            message="Watching PYPL.",
            watchlist_changes=[ProposedWatchlistChange(ticker="pypl", action="add")],
        )
    )

    result = await run_chat(priced_market, client, "watch PYPL")

    change = result.actions.watchlist_changes[0]
    assert (change.ticker, change.action, change.status) == ("PYPL", "add", "executed")
    assert watchlist_repo.has_ticker("PYPL")
    assert "PYPL" in priced_market.source.get_tickers()


async def test_watchlist_remove_of_unwatched_ticker_fails_gracefully(priced_market, stub_client):
    client = stub_client(
        AssistantResponse(
            message="Removing.",
            watchlist_changes=[ProposedWatchlistChange(ticker="PYPL", action="remove")],
        )
    )

    result = await run_chat(priced_market, client, "drop PYPL")

    change = result.actions.watchlist_changes[0]
    assert change.status == "failed"
    assert "not on the watchlist" in change.error


async def test_invalid_watchlist_ticker_fails_gracefully(priced_market, stub_client):
    client = stub_client(
        AssistantResponse(
            message="Adding.",
            watchlist_changes=[ProposedWatchlistChange(ticker="!!", action="add")],
        )
    )

    result = await run_chat(priced_market, client, "watch nonsense")

    assert result.actions.watchlist_changes[0].status == "failed"
    assert "Invalid ticker" in result.actions.watchlist_changes[0].error


async def test_watchlist_add_runs_before_the_trade(priced_market, stub_client):
    priced_market.cache.update("PYPL", 50.0)
    client = stub_client(
        AssistantResponse(
            message="Adding then buying.",
            trades=[ProposedTrade(ticker="PYPL", side="buy", quantity=2)],
            watchlist_changes=[ProposedWatchlistChange(ticker="PYPL", action="add")],
        )
    )

    result = await run_chat(priced_market, client, "watch and buy PYPL")

    assert result.actions.watchlist_changes[0].status == "executed"
    assert result.actions.trades[0].status == "executed"


async def test_history_is_passed_to_the_client(priced_market, stub_client):
    chat_repo.add_message("user", "first question")
    chat_repo.add_message("assistant", "first answer")
    client = stub_client(analysis())

    await run_chat(priced_market, client, "second question")

    roles = [m["role"] for m in client.last_prompt]
    assert roles == ["system", "user", "assistant", "user"]
    assert client.last_prompt[1]["content"] == "first question"
    assert client.last_prompt[-1]["content"] == "second question"


async def test_history_is_capped_at_the_limit(priced_market, stub_client):
    for index in range(HISTORY_LIMIT + 6):
        chat_repo.add_message("user", f"message {index}")
    client = stub_client(analysis())

    await run_chat(priced_market, client, "now")

    prior = [m for m in client.last_prompt if m["role"] != "system"][:-1]
    assert len(prior) == HISTORY_LIMIT
    assert prior[0]["content"] == "message 6"


async def test_live_portfolio_is_in_the_prompt(priced_market, stub_client):
    client = stub_client(analysis())

    await run_chat(priced_market, client, "status")

    system = client.last_prompt[0]["content"]
    assert "$10,000.00" in system
    assert "AAPL" in system


async def test_llm_failure_persists_nothing(priced_market, stub_client):
    client = stub_client(LLMError("boom"))

    with pytest.raises(LLMError):
        await run_chat(priced_market, client, "hello")

    assert chat_repo.list_messages() == []


async def test_stub_client_is_the_llm_client_interface(priced_market):
    client = StubClient(analysis("ok"))

    result = await run_chat(priced_market, client, "hi")

    assert result.message == "ok"
    assert result.created_at
