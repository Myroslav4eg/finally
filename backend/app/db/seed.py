"""Default seed data written on first initialization."""

from __future__ import annotations

import sqlite3

from .config import DEFAULT_CASH_BALANCE, DEFAULT_TICKERS, DEFAULT_USER_ID
from .helpers import new_id, utc_now_iso


def seed_defaults(conn: sqlite3.Connection, user_id: str = DEFAULT_USER_ID) -> None:
    """Insert the default profile and watchlist if they are not already present.

    Idempotent: existing rows are left untouched.
    """
    now = utc_now_iso()
    conn.execute(
        "INSERT OR IGNORE INTO users_profile (id, cash_balance, created_at) VALUES (?, ?, ?)",
        (user_id, DEFAULT_CASH_BALANCE, now),
    )
    conn.executemany(
        "INSERT OR IGNORE INTO watchlist (id, user_id, ticker, added_at) VALUES (?, ?, ?, ?)",
        [(new_id(), user_id, ticker, now) for ticker in DEFAULT_TICKERS],
    )
