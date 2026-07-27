"""Dataclasses returned by the database layer.

These cross the module boundary instead of raw sqlite3.Row objects.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict, dataclass


@dataclass(frozen=True, slots=True)
class UserProfile:
    """A user's cash state. One row per user; single-user app uses id='default'."""

    id: str
    cash_balance: float
    created_at: str

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> UserProfile:
        return cls(id=row["id"], cash_balance=row["cash_balance"], created_at=row["created_at"])

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class WatchlistEntry:
    """A ticker the user is watching."""

    id: str
    user_id: str
    ticker: str
    added_at: str

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> WatchlistEntry:
        return cls(
            id=row["id"],
            user_id=row["user_id"],
            ticker=row["ticker"],
            added_at=row["added_at"],
        )

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class Position:
    """A holding in one ticker. Quantity is fractional-share friendly."""

    id: str
    user_id: str
    ticker: str
    quantity: float
    avg_cost: float
    updated_at: str

    @property
    def cost_basis(self) -> float:
        """Total amount paid for the position."""
        return round(self.quantity * self.avg_cost, 2)

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> Position:
        return cls(
            id=row["id"],
            user_id=row["user_id"],
            ticker=row["ticker"],
            quantity=row["quantity"],
            avg_cost=row["avg_cost"],
            updated_at=row["updated_at"],
        )

    def to_dict(self) -> dict:
        return asdict(self) | {"cost_basis": self.cost_basis}


@dataclass(frozen=True, slots=True)
class Trade:
    """An executed trade. The trades table is append-only."""

    id: str
    user_id: str
    ticker: str
    side: str  # "buy" or "sell"
    quantity: float
    price: float
    executed_at: str

    @property
    def notional(self) -> float:
        """Cash value of the trade."""
        return round(self.quantity * self.price, 2)

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> Trade:
        return cls(
            id=row["id"],
            user_id=row["user_id"],
            ticker=row["ticker"],
            side=row["side"],
            quantity=row["quantity"],
            price=row["price"],
            executed_at=row["executed_at"],
        )

    def to_dict(self) -> dict:
        return asdict(self) | {"notional": self.notional}


@dataclass(frozen=True, slots=True)
class PortfolioSnapshot:
    """Total portfolio value at a point in time, for the P&L chart."""

    id: str
    user_id: str
    total_value: float
    recorded_at: str

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> PortfolioSnapshot:
        return cls(
            id=row["id"],
            user_id=row["user_id"],
            total_value=row["total_value"],
            recorded_at=row["recorded_at"],
        )

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class ChatMessage:
    """One turn of the conversation with the LLM.

    `actions` holds the trades and watchlist changes executed for an assistant
    message; it is None for user messages.
    """

    id: str
    user_id: str
    role: str  # "user" or "assistant"
    content: str
    actions: dict | None
    created_at: str

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> ChatMessage:
        raw = row["actions"]
        return cls(
            id=row["id"],
            user_id=row["user_id"],
            role=row["role"],
            content=row["content"],
            actions=json.loads(raw) if raw else None,
            created_at=row["created_at"],
        )

    def to_dict(self) -> dict:
        return asdict(self)
