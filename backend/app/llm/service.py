"""The chat turn: build context, call the model, run its actions, persist the turn."""

from __future__ import annotations

import asyncio

from app.db import DEFAULT_USER_ID
from app.db.repositories import chat as chat_repo
from app.services import ServiceError, add_ticker, execute_trade, get_portfolio, get_watchlist
from app.services import remove_ticker as remove_watchlist_ticker
from app.state import MarketContext

from .client import LLMClient
from .prompts import HISTORY_LIMIT, build_messages
from .schemas import (
    AssistantResponse,
    ChatActions,
    ChatResponse,
    ProposedTrade,
    ProposedWatchlistChange,
    TradeOutcome,
    WatchlistOutcome,
)


async def _run_trade(market: MarketContext, trade: ProposedTrade, user_id: str) -> TradeOutcome:
    """Execute one proposed trade, recording a failure instead of raising."""
    try:
        execution = await execute_trade(
            market, trade.ticker, trade.side, trade.quantity, user_id=user_id
        )
    except ServiceError as exc:
        return TradeOutcome(
            ticker=trade.ticker.upper(),
            side=trade.side,
            quantity=trade.quantity,
            status="failed",
            error=str(exc),
        )
    return TradeOutcome(
        ticker=execution.trade.ticker,
        side=execution.trade.side,
        quantity=execution.trade.quantity,
        status="executed",
        price=execution.trade.price,
    )


async def _run_watchlist_change(
    market: MarketContext,
    change: ProposedWatchlistChange,
    user_id: str,
) -> WatchlistOutcome:
    """Apply one proposed watchlist change, recording a failure instead of raising."""
    try:
        if change.action == "add":
            item = await add_ticker(market, change.ticker, user_id=user_id)
            ticker = item.ticker
        else:
            ticker = change.ticker.strip().upper()
            removed = await remove_watchlist_ticker(market, change.ticker, user_id=user_id)
            if not removed:
                return WatchlistOutcome(
                    ticker=ticker,
                    action=change.action,
                    status="failed",
                    error=f"{ticker} is not on the watchlist",
                )
    except ServiceError as exc:
        return WatchlistOutcome(
            ticker=change.ticker.upper(),
            action=change.action,
            status="failed",
            error=str(exc),
        )
    return WatchlistOutcome(ticker=ticker, action=change.action, status="executed")


async def execute_actions(
    market: MarketContext,
    response: AssistantResponse,
    user_id: str = DEFAULT_USER_ID,
) -> ChatActions:
    """Run the assistant's proposed actions in order, collecting every outcome.

    Watchlist changes run first so a newly added ticker can be traded on the
    same turn.
    """
    watchlist_outcomes = [
        await _run_watchlist_change(market, change, user_id)
        for change in response.watchlist_changes
    ]
    trade_outcomes = [await _run_trade(market, trade, user_id) for trade in response.trades]
    return ChatActions(trades=trade_outcomes, watchlist_changes=watchlist_outcomes)


def _persist_turn(message: str, response: AssistantResponse, actions: ChatActions, user_id: str):
    """Store the user turn and the assistant turn with its actions JSON."""
    chat_repo.add_message("user", message, user_id=user_id)
    stored_actions = None if actions.is_empty else actions.model_dump()
    return chat_repo.add_message(
        "assistant", response.message, actions=stored_actions, user_id=user_id
    )


async def run_chat(
    market: MarketContext,
    client: LLMClient,
    message: str,
    user_id: str = DEFAULT_USER_ID,
) -> ChatResponse:
    """Handle one chat turn end to end.

    Nothing is persisted if the model call fails, so a failed turn leaves no
    dangling user message in the history.
    """
    portfolio, watchlist, history = await asyncio.gather(
        get_portfolio(market, user_id=user_id),
        get_watchlist(market, user_id=user_id),
        asyncio.to_thread(chat_repo.list_messages, HISTORY_LIMIT, user_id),
    )

    prompt = build_messages(portfolio, watchlist, history, message)
    response = await client.complete(prompt)

    actions = await execute_actions(market, response, user_id)
    stored = await asyncio.to_thread(_persist_turn, message, response, actions, user_id)

    return ChatResponse(message=response.message, actions=actions, created_at=stored.created_at)
