"""Data access for the watchlist table."""

from __future__ import annotations

import sqlite3

from ..config import DEFAULT_USER_ID
from ..connection import session
from ..helpers import new_id, normalize_ticker, utc_now_iso
from ..models import WatchlistEntry


def list_watchlist(
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> list[WatchlistEntry]:
    """All watched tickers, oldest addition first."""
    with session(conn) as db:
        rows = db.execute(
            "SELECT * FROM watchlist WHERE user_id = ? ORDER BY added_at, ticker",
            (user_id,),
        ).fetchall()
    return [WatchlistEntry.from_row(row) for row in rows]


def list_tickers(
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> list[str]:
    """Just the ticker symbols, in watchlist order."""
    return [entry.ticker for entry in list_watchlist(user_id, conn)]


def get_entry(
    ticker: str,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> WatchlistEntry | None:
    """One watchlist entry, or None if the ticker is not watched."""
    with session(conn) as db:
        row = db.execute(
            "SELECT * FROM watchlist WHERE user_id = ? AND ticker = ?",
            (user_id, normalize_ticker(ticker)),
        ).fetchone()
    return WatchlistEntry.from_row(row) if row else None


def has_ticker(
    ticker: str,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> bool:
    """Whether the ticker is already on the watchlist."""
    return get_entry(ticker, user_id, conn) is not None


def add_ticker(
    ticker: str,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> WatchlistEntry:
    """Add a ticker. Idempotent: returns the existing entry if already watched.

    Tickers are uppercased before storage.
    """
    symbol = normalize_ticker(ticker)
    with session(conn) as db:
        db.execute(
            "INSERT OR IGNORE INTO watchlist (id, user_id, ticker, added_at) VALUES (?, ?, ?, ?)",
            (new_id(), user_id, symbol, utc_now_iso()),
        )
        entry = get_entry(symbol, user_id, db)
    assert entry is not None
    return entry


def remove_ticker(
    ticker: str,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> bool:
    """Remove a ticker. Returns True if a row was deleted, False if it was not watched."""
    with session(conn) as db:
        cursor = db.execute(
            "DELETE FROM watchlist WHERE user_id = ? AND ticker = ?",
            (user_id, normalize_ticker(ticker)),
        )
        return cursor.rowcount > 0
