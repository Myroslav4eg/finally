"""Portfolio valuation, P&L math, and snapshot recording."""

from __future__ import annotations

import asyncio
import sqlite3

from app.db import DEFAULT_USER_ID, Position
from app.db.repositories import positions as positions_repo
from app.db.repositories import profile as profile_repo
from app.db.repositories import snapshots as snapshots_repo
from app.market import PriceCache
from app.schemas import Portfolio, PortfolioHistory, PositionValue, SnapshotPoint
from app.state import MarketContext


def _percent(numerator: float, denominator: float) -> float:
    """Percentage of numerator over denominator, 0.0 when the base is zero."""
    if denominator == 0:
        return 0.0
    return round(numerator / denominator * 100, 2)


def price_for(cache: PriceCache, position: Position) -> float | None:
    """Latest cached price for a holding, or None when the ticker is untracked."""
    return cache.get_price(position.ticker)


def value_position(
    position: Position,
    price: float | None,
    positions_value: float,
) -> PositionValue:
    """Value a single holding. An untracked ticker is held at its average cost."""
    effective = price if price is not None else position.avg_cost
    market_value = round(position.quantity * effective, 2)
    cost_basis = round(position.quantity * position.avg_cost, 2)
    pnl = round(market_value - cost_basis, 2)
    return PositionValue(
        ticker=position.ticker,
        quantity=position.quantity,
        avg_cost=round(position.avg_cost, 4),
        cost_basis=cost_basis,
        current_price=price,
        market_value=market_value,
        unrealized_pnl=pnl,
        unrealized_pnl_percent=_percent(pnl, cost_basis),
        weight=_percent(market_value, positions_value),
    )


def build_portfolio(
    cache: PriceCache,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> Portfolio:
    """Compute the full portfolio valuation. Synchronous."""
    cash = profile_repo.get_cash_balance(user_id=user_id, conn=conn)
    holdings = positions_repo.list_positions(user_id=user_id, conn=conn)
    priced = [(p, price_for(cache, p)) for p in holdings]

    positions_value = round(
        sum(p.quantity * (price if price is not None else p.avg_cost) for p, price in priced), 2
    )
    values = [value_position(p, price, positions_value) for p, price in priced]
    cost_basis = round(sum(v.cost_basis for v in values), 2)
    unrealized = round(positions_value - cost_basis, 2)

    return Portfolio(
        cash_balance=round(cash, 2),
        positions=values,
        positions_value=positions_value,
        total_value=round(cash + positions_value, 2),
        unrealized_pnl=unrealized,
        unrealized_pnl_percent=_percent(unrealized, cost_basis),
    )


def record_snapshot(
    cache: PriceCache,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> float:
    """Value the portfolio and append a snapshot row. Returns the total value."""
    portfolio = build_portfolio(cache, user_id=user_id, conn=conn)
    snapshots_repo.record_snapshot(portfolio.total_value, user_id=user_id, conn=conn)
    return portfolio.total_value


def build_history(
    limit: int | None = None,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> PortfolioHistory:
    """Load portfolio value snapshots, oldest first. Synchronous."""
    rows = snapshots_repo.list_snapshots(limit=limit, user_id=user_id, conn=conn)
    return PortfolioHistory(
        snapshots=[
            SnapshotPoint(total_value=row.total_value, recorded_at=row.recorded_at) for row in rows
        ]
    )


async def get_portfolio(market: MarketContext, user_id: str = DEFAULT_USER_ID) -> Portfolio:
    """Async wrapper over build_portfolio for use in request handlers."""
    return await asyncio.to_thread(build_portfolio, market.cache, user_id)


async def get_history(
    limit: int | None = None,
    user_id: str = DEFAULT_USER_ID,
) -> PortfolioHistory:
    """Async wrapper over build_history for use in request handlers."""
    return await asyncio.to_thread(build_history, limit, user_id)
