"""Data access for the trades table (append-only log)."""

from __future__ import annotations

import sqlite3

from ..config import DEFAULT_USER_ID
from ..connection import session
from ..helpers import new_id, normalize_ticker, utc_now_iso
from ..models import Trade

VALID_SIDES = ("buy", "sell")


def record_trade(
    ticker: str,
    side: str,
    quantity: float,
    price: float,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> Trade:
    """Append an executed trade to the log and return it.

    `side` must be "buy" or "sell"; anything else raises ValueError.
    """
    if side not in VALID_SIDES:
        raise ValueError(f"side must be one of {VALID_SIDES}, got {side!r}")

    trade = Trade(
        id=new_id(),
        user_id=user_id,
        ticker=normalize_ticker(ticker),
        side=side,
        quantity=float(quantity),
        price=float(price),
        executed_at=utc_now_iso(),
    )
    with session(conn) as db:
        db.execute(
            """
            INSERT INTO trades (id, user_id, ticker, side, quantity, price, executed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                trade.id,
                trade.user_id,
                trade.ticker,
                trade.side,
                trade.quantity,
                trade.price,
                trade.executed_at,
            ),
        )
    return trade


def list_trades(
    ticker: str | None = None,
    limit: int | None = None,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> list[Trade]:
    """Trade history, most recent first. Optionally filtered by ticker and capped by limit."""
    sql = "SELECT * FROM trades WHERE user_id = ?"
    params: list[object] = [user_id]
    if ticker:
        sql += " AND ticker = ?"
        params.append(normalize_ticker(ticker))
    sql += " ORDER BY executed_at DESC, rowid DESC"
    if limit is not None:
        sql += " LIMIT ?"
        params.append(limit)

    with session(conn) as db:
        rows = db.execute(sql, params).fetchall()
    return [Trade.from_row(row) for row in rows]
