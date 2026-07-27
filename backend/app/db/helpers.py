"""Small shared utilities for the database layer."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone


def new_id() -> str:
    """Generate a UUID4 primary key as a string."""
    return str(uuid.uuid4())


def utc_now_iso() -> str:
    """Current UTC time as an ISO 8601 string, e.g. '2026-07-26T12:00:00.123456+00:00'."""
    return datetime.now(timezone.utc).isoformat()


def normalize_ticker(ticker: str) -> str:
    """Uppercase and strip a ticker symbol so lookups are case-insensitive."""
    return ticker.strip().upper()
