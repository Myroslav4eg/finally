"""Ticker symbol normalization."""

from __future__ import annotations

import re

from .errors import ServiceError

_SYMBOL = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$")


def normalize_ticker(ticker: str) -> str:
    """Uppercase and validate a ticker symbol.

    Raises ServiceError if the symbol is empty or not a plausible stock symbol.
    """
    symbol = ticker.strip().upper()
    if not _SYMBOL.match(symbol):
        raise ServiceError(f"Invalid ticker symbol: {ticker!r}")
    return symbol
