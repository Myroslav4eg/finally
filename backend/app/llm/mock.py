"""Deterministic offline responses for LLM_MOCK=true.

The trigger contract is documented in planning/LLM_MOCK.md and is what the E2E
tests assert against. Keep the two in step.
"""

from __future__ import annotations

import re

from .schemas import AssistantResponse, ProposedTrade, ProposedWatchlistChange

DEFAULT_TICKER = "AAPL"
DEFAULT_QUANTITY = 1.0

TICKER_PATTERN = re.compile(r"\b[A-Z]{2,5}\b")
QUANTITY_PATTERN = re.compile(r"\d+(?:\.\d+)?")

ANALYSIS_MESSAGE = (
    "Mock analysis: your portfolio looks balanced and no action is needed right now."
)


def extract_ticker(text: str) -> str:
    """First all-caps 2-5 letter word in the message, or AAPL."""
    match = TICKER_PATTERN.search(text)
    return match.group(0) if match else DEFAULT_TICKER


def extract_quantity(text: str) -> float:
    """First number in the message, or 1."""
    match = QUANTITY_PATTERN.search(text)
    return float(match.group(0)) if match else DEFAULT_QUANTITY


def last_user_message(messages: list[dict[str, str]]) -> str:
    """The most recent user turn, or an empty string if there is none."""
    for message in reversed(messages):
        if message.get("role") == "user":
            return message.get("content", "")
    return ""


def mock_response(text: str) -> AssistantResponse:
    """Map a user message to a fixed response using keyword triggers."""
    lowered = text.lower()
    ticker = extract_ticker(text)

    if "buy" in lowered or "sell" in lowered:
        side = "sell" if "sell" in lowered else "buy"
        quantity = extract_quantity(text)
        return AssistantResponse(
            message=f"Mock trade: submitting a {side} for {quantity:g} {ticker} at the market price.",
            trades=[ProposedTrade(ticker=ticker, side=side, quantity=quantity)],
        )

    if "watchlist" in lowered or "watch" in lowered:
        action = "remove" if "remove" in lowered or "drop" in lowered else "add"
        verb = "Removing" if action == "remove" else "Adding"
        preposition = "from" if action == "remove" else "to"
        return AssistantResponse(
            message=f"Mock watchlist: {verb.lower()} {ticker} {preposition} your watchlist.",
            watchlist_changes=[ProposedWatchlistChange(ticker=ticker, action=action)],
        )

    return AssistantResponse(message=ANALYSIS_MESSAGE)


class MockLLMClient:
    """LLMClient implementation that never touches the network."""

    async def complete(self, messages: list[dict[str, str]]) -> AssistantResponse:
        """Return the fixed response for the last user message."""
        return mock_response(last_user_message(messages))
