"""Data access for the portfolio_snapshots table (P&L chart series)."""

from __future__ import annotations

import sqlite3

from ..config import DEFAULT_USER_ID
from ..connection import session
from ..helpers import new_id, utc_now_iso
from ..models import PortfolioSnapshot


def record_snapshot(
    total_value: float,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> PortfolioSnapshot:
    """Append a portfolio value snapshot stamped with the current time."""
    snapshot = PortfolioSnapshot(
        id=new_id(),
        user_id=user_id,
        total_value=float(total_value),
        recorded_at=utc_now_iso(),
    )
    with session(conn) as db:
        db.execute(
            """
            INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at)
            VALUES (?, ?, ?, ?)
            """,
            (snapshot.id, snapshot.user_id, snapshot.total_value, snapshot.recorded_at),
        )
    return snapshot


def list_snapshots(
    since: str | None = None,
    limit: int | None = None,
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> list[PortfolioSnapshot]:
    """Snapshots in chronological order, ready to plot.

    `since` is an ISO timestamp lower bound (inclusive). When `limit` is given,
    the most recent `limit` snapshots are returned, still oldest-first.
    """
    base = "SELECT * FROM portfolio_snapshots WHERE user_id = ?"
    params: list[object] = [user_id]
    if since:
        base += " AND recorded_at >= ?"
        params.append(since)

    if limit is None:
        sql = f"{base} ORDER BY recorded_at, rowid"
    else:
        sql = f"{base} ORDER BY recorded_at DESC, rowid DESC LIMIT ?"
        params.append(limit)

    with session(conn) as db:
        rows = db.execute(sql, params).fetchall()
    if limit is not None:
        rows = rows[::-1]
    return [PortfolioSnapshot.from_row(row) for row in rows]


def latest_snapshot(
    user_id: str = DEFAULT_USER_ID,
    conn: sqlite3.Connection | None = None,
) -> PortfolioSnapshot | None:
    """Most recent snapshot, or None if none have been recorded."""
    with session(conn) as db:
        row = db.execute(
            """
            SELECT * FROM portfolio_snapshots WHERE user_id = ?
            ORDER BY recorded_at DESC, rowid DESC LIMIT 1
            """,
            (user_id,),
        ).fetchone()
    return PortfolioSnapshot.from_row(row) if row else None
