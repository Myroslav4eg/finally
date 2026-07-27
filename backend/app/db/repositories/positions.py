"""Data access for the positions table."""

from __future__ import annotations

import sqlite3

from ..config import DEFAULT_USER_ID
from ..connection import session
from ..helpers import new_id, normalize_ticker, utc_now_iso
from ..models import Position


def list_positions(
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> list[Position]:
    """All open positions, alphabetical by ticker."""
    with session(conn) as db:
        rows = db.execute(
            "SELECT * FROM positions WHERE user_id = ? ORDER BY ticker",
            (user_id,),
        ).fetchall()
    return [Position.from_row(row) for row in rows]


def get_position(
    ticker: str,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> Position | None:
    """One position, or None if the user holds no shares of that ticker."""
    with session(conn) as db:
        row = db.execute(
            "SELECT * FROM positions WHERE user_id = ? AND ticker = ?",
            (user_id, normalize_ticker(ticker)),
        ).fetchone()
    return Position.from_row(row) if row else None


def upsert_position(
    ticker: str,
    quantity: float,
    avg_cost: float,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> Position:
    """Create or overwrite the position for a ticker and return it.

    Quantity and avg_cost are absolute values, not deltas. Callers compute the
    new weighted average cost.
    """
    symbol = normalize_ticker(ticker)
    with session(conn) as db:
        db.execute(
            """
            INSERT INTO positions (id, user_id, ticker, quantity, avg_cost, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (user_id, ticker) DO UPDATE SET
                quantity = excluded.quantity,
                avg_cost = excluded.avg_cost,
                updated_at = excluded.updated_at
            """,
            (new_id(), user_id, symbol, float(quantity), float(avg_cost), utc_now_iso()),
        )
        position = get_position(symbol, user_id, db)
    assert position is not None
    return position


def delete_position(
    ticker: str,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> bool:
    """Remove a position entirely. Returns True if a row was deleted."""
    with session(conn) as db:
        cursor = db.execute(
            "DELETE FROM positions WHERE user_id = ? AND ticker = ?",
            (user_id, normalize_ticker(ticker)),
        )
        return cursor.rowcount > 0
