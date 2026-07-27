"""Market order execution.

Every trade — manual or LLM-initiated — goes through `execute_trade`, so the
same validation applies everywhere.
"""

from __future__ import annotations

import asyncio

from app.db import DEFAULT_USER_ID, Position, Trade, transaction
from app.db.repositories import positions as positions_repo
from app.db.repositories import profile as profile_repo
from app.db.repositories import snapshots as snapshots_repo
from app.db.repositories import trades as trades_repo
from app.market import PriceCache
from app.schemas import Side, TradeExecution, TradeRecord
from app.state import MarketContext

from .errors import ServiceError
from .portfolio import build_portfolio
from .tickers import normalize_ticker

# Quantities below this are treated as a fully closed position.
DUST = 1e-9


def _to_record(trade: Trade) -> TradeRecord:
    """Map a stored Trade onto its API representation."""
    return TradeRecord(
        id=trade.id,
        ticker=trade.ticker,
        side=trade.side,
        quantity=trade.quantity,
        price=trade.price,
        notional=trade.notional,
        executed_at=trade.executed_at,
    )


def _validate(ticker: str, side: str, quantity: float) -> tuple[str, Side]:
    """Normalize and check the order fields that do not need database access."""
    symbol = normalize_ticker(ticker)
    if side not in ("buy", "sell"):
        raise ServiceError(f"Invalid side: {side!r}. Use 'buy' or 'sell'.")
    if quantity <= 0:
        raise ServiceError("Quantity must be greater than zero")
    return symbol, side


def _buy(position: Position | None, quantity: float, price: float) -> tuple[float, float]:
    """New quantity and weighted-average cost after a buy."""
    held = position.quantity if position else 0.0
    prior_cost = held * position.avg_cost if position else 0.0
    new_quantity = held + quantity
    return new_quantity, (prior_cost + quantity * price) / new_quantity


def execute_trade_sync(
    cache: PriceCache,
    ticker: str,
    side: str,
    quantity: float,
    user_id: str = DEFAULT_USER_ID,
) -> TradeExecution:
    """Validate and fill a market order at the latest cached price.

    Raises ServiceError for an invalid symbol, a non-positive quantity, a ticker
    with no cached price, insufficient cash, or insufficient shares. Cash, the
    position row, the trade log, and the snapshot are written in one transaction.
    """
    symbol, order_side = _validate(ticker, side, quantity)

    price = cache.get_price(symbol)
    if price is None:
        raise ServiceError(f"No price available for {symbol}")

    notional = round(quantity * price, 2)

    with transaction() as conn:
        position = positions_repo.get_position(symbol, user_id=user_id, conn=conn)

        if order_side == "buy":
            cash = profile_repo.get_cash_balance(user_id=user_id, conn=conn)
            if notional > cash:
                raise ServiceError(
                    f"Insufficient cash: {symbol} costs {notional:.2f}, available {cash:.2f}"
                )
            new_quantity, new_avg_cost = _buy(position, quantity, price)
            profile_repo.adjust_cash_balance(-notional, user_id=user_id, conn=conn)
            positions_repo.upsert_position(
                symbol, new_quantity, new_avg_cost, user_id=user_id, conn=conn
            )
        else:
            held = position.quantity if position else 0.0
            if quantity > held + DUST:
                raise ServiceError(
                    f"Insufficient shares: cannot sell {quantity} {symbol}, holding {held}"
                )
            profile_repo.adjust_cash_balance(notional, user_id=user_id, conn=conn)
            remaining = held - quantity
            if remaining <= DUST:
                positions_repo.delete_position(symbol, user_id=user_id, conn=conn)
            else:
                positions_repo.upsert_position(
                    symbol, remaining, position.avg_cost, user_id=user_id, conn=conn
                )

        trade = trades_repo.record_trade(
            symbol, order_side, quantity, price, user_id=user_id, conn=conn
        )
        portfolio = build_portfolio(cache, user_id=user_id, conn=conn)
        snapshots_repo.record_snapshot(portfolio.total_value, user_id=user_id, conn=conn)

    held_after = next((p for p in portfolio.positions if p.ticker == symbol), None)
    return TradeExecution(
        trade=_to_record(trade),
        position=held_after,
        cash_balance=portfolio.cash_balance,
        total_value=portfolio.total_value,
    )


async def execute_trade(
    market: MarketContext,
    ticker: str,
    side: str,
    quantity: float,
    user_id: str = DEFAULT_USER_ID,
) -> TradeExecution:
    """Async wrapper over execute_trade_sync for use in request handlers."""
    return await asyncio.to_thread(
        execute_trade_sync, market.cache, ticker, side, quantity, user_id
    )
