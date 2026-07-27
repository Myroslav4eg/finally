"""Pydantic models for the chat request, the LLM structured output, and the reply.

`AssistantResponse` is what the model is asked to produce; everything else is
what the API returns once the proposed actions have been run through the
service layer.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas import Side

WatchlistAction = Literal["add", "remove"]
ActionStatus = Literal["executed", "failed"]


class ProposedTrade(BaseModel):
    """A trade the assistant wants to execute."""

    ticker: str
    side: Side
    quantity: float


class ProposedWatchlistChange(BaseModel):
    """A watchlist modification the assistant wants to make."""

    ticker: str
    action: WatchlistAction


class AssistantResponse(BaseModel):
    """The structured output schema the LLM is constrained to."""

    message: str
    trades: list[ProposedTrade] = Field(default_factory=list)
    watchlist_changes: list[ProposedWatchlistChange] = Field(default_factory=list)


class TradeOutcome(BaseModel):
    """The result of running one proposed trade through the trade service."""

    ticker: str
    side: Side
    quantity: float
    status: ActionStatus
    price: float | None = None
    error: str | None = None


class WatchlistOutcome(BaseModel):
    """The result of running one proposed watchlist change through the service."""

    ticker: str
    action: WatchlistAction
    status: ActionStatus
    error: str | None = None


class ChatActions(BaseModel):
    """Everything the assistant did on this turn, successes and failures alike."""

    trades: list[TradeOutcome] = Field(default_factory=list)
    watchlist_changes: list[WatchlistOutcome] = Field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        """True when the turn was conversation only."""
        return not self.trades and not self.watchlist_changes


class ChatRequest(BaseModel):
    """Request body for POST /api/chat."""

    message: str


class ChatResponse(BaseModel):
    """The assistant's reply plus the actions it executed."""

    message: str
    actions: ChatActions
    created_at: str
