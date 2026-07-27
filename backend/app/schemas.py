"""Pydantic models shared by the services layer and the API routes.

Services return these models directly, so route handlers declare them as
`response_model` without any further mapping.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

Side = Literal["buy", "sell"]


class PositionValue(BaseModel):
    """A holding valued at the latest cached price."""

    ticker: str
    quantity: float
    avg_cost: float
    cost_basis: float
    current_price: float | None
    market_value: float
    unrealized_pnl: float
    unrealized_pnl_percent: float
    weight: float


class Portfolio(BaseModel):
    """Cash, holdings, and aggregate valuation for one user."""

    cash_balance: float
    positions: list[PositionValue]
    positions_value: float
    total_value: float
    unrealized_pnl: float
    unrealized_pnl_percent: float


class TradeRecord(BaseModel):
    """An executed trade as stored in the trade log."""

    id: str
    ticker: str
    side: Side
    quantity: float
    price: float
    notional: float
    executed_at: str


class TradeRequest(BaseModel):
    """Market order request body. Quantity is validated by the trade service."""

    ticker: str
    quantity: float
    side: Side


class TradeExecution(BaseModel):
    """Result of a filled market order, with the resulting portfolio state."""

    trade: TradeRecord
    position: PositionValue | None
    cash_balance: float
    total_value: float


class SnapshotPoint(BaseModel):
    """One point on the portfolio value chart."""

    total_value: float
    recorded_at: str


class PortfolioHistory(BaseModel):
    """Portfolio value snapshots, oldest first."""

    snapshots: list[SnapshotPoint]


class WatchlistItem(BaseModel):
    """A watched ticker with its latest cached price, if any."""

    ticker: str
    added_at: str
    price: float | None
    previous_price: float | None
    change: float | None
    change_percent: float | None
    direction: str | None


class WatchlistResponse(BaseModel):
    """The full watchlist, ordered by when each ticker was added."""

    items: list[WatchlistItem]


class WatchlistAddRequest(BaseModel):
    """Request body for adding a ticker to the watchlist."""

    ticker: str


class HealthResponse(BaseModel):
    """Health check payload."""

    status: str
    market_source: str
    tracked_tickers: int
