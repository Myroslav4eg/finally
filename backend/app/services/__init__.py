"""Business logic between the database and the API.

Import these functions directly to reuse the same validation the REST routes
apply. See planning/BACKEND_SERVICES.md for the full contract.
"""

from .errors import ServiceError
from .portfolio import build_portfolio, get_history, get_portfolio, record_snapshot
from .snapshots import SNAPSHOT_INTERVAL, run_snapshot_loop
from .tickers import normalize_ticker
from .trading import execute_trade, execute_trade_sync
from .watchlist import add_ticker, get_watchlist, remove_ticker

__all__ = [
    "ServiceError",
    "SNAPSHOT_INTERVAL",
    "add_ticker",
    "build_portfolio",
    "execute_trade",
    "execute_trade_sync",
    "get_history",
    "get_portfolio",
    "get_watchlist",
    "normalize_ticker",
    "record_snapshot",
    "remove_ticker",
    "run_snapshot_loop",
]
