"""Database configuration: file location and seed defaults."""

from __future__ import annotations

import os
from pathlib import Path

DB_PATH_ENV_VAR = "FINALLY_DB_PATH"

# Single-user model: every row carries this user id.
DEFAULT_USER_ID = "default"

# Seeded on first initialization.
DEFAULT_CASH_BALANCE = 10000.0
DEFAULT_TICKERS: tuple[str, ...] = (
    "AAPL",
    "GOOGL",
    "MSFT",
    "AMZN",
    "TSLA",
    "NVDA",
    "META",
    "JPM",
    "V",
    "NFLX",
)

# <project root>/db/finally.db - app/db/config.py is 3 levels below the backend dir.
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DB_PATH = _PROJECT_ROOT / "db" / "finally.db"


def get_db_path() -> Path:
    """Resolve the SQLite file path.

    Reads FINALLY_DB_PATH on every call so tests and Docker can override it.
    Falls back to <project root>/db/finally.db.
    """
    override = os.environ.get(DB_PATH_ENV_VAR, "").strip()
    return Path(override) if override else DEFAULT_DB_PATH
