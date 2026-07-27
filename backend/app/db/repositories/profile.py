"""Data access for the users_profile table (cash balance)."""

from __future__ import annotations

import sqlite3

from ..config import DEFAULT_USER_ID
from ..connection import session
from ..models import UserProfile


def get_profile(
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> UserProfile:
    """Return the user's profile. Raises ValueError if the user does not exist."""
    with session(conn) as db:
        row = db.execute("SELECT * FROM users_profile WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise ValueError(f"No profile for user_id={user_id!r}")
    return UserProfile.from_row(row)


def get_cash_balance(
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> float:
    """Return the user's cash balance."""
    return get_profile(user_id, conn).cash_balance


def set_cash_balance(
    balance: float,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> UserProfile:
    """Set the cash balance to an absolute value and return the updated profile."""
    with session(conn) as db:
        db.execute(
            "UPDATE users_profile SET cash_balance = ? WHERE id = ?",
            (float(balance), user_id),
        )
        return get_profile(user_id, db)


def adjust_cash_balance(
    delta: float,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> UserProfile:
    """Add `delta` (negative to spend) to the cash balance in a single statement.

    Does not validate against overdraft; callers check affordability first.
    """
    with session(conn) as db:
        db.execute(
            "UPDATE users_profile SET cash_balance = cash_balance + ? WHERE id = ?",
            (float(delta), user_id),
        )
        return get_profile(user_id, db)
