"""Database subsystem for FinAlly.

Public API:
    initialize_database  - Create schema and seed defaults (idempotent)
    transaction          - Context manager grouping repository calls atomically
    repositories         - chat, positions, profile, snapshots, trades, watchlist

All functions are synchronous. Call them from FastAPI via asyncio.to_thread.
See planning/DATABASE.md for the full contract.
"""

from .config import DEFAULT_CASH_BALANCE, DEFAULT_TICKERS, DEFAULT_USER_ID, get_db_path
from .connection import connection, initialize_database, transaction
from .models import (
    ChatMessage,
    PortfolioSnapshot,
    Position,
    Trade,
    UserProfile,
    WatchlistEntry,
)
from .repositories import chat, positions, profile, snapshots, trades, watchlist

__all__ = [
    "DEFAULT_CASH_BALANCE",
    "DEFAULT_TICKERS",
    "DEFAULT_USER_ID",
    "get_db_path",
    "initialize_database",
    "connection",
    "transaction",
    "UserProfile",
    "WatchlistEntry",
    "Position",
    "Trade",
    "PortfolioSnapshot",
    "ChatMessage",
    "chat",
    "positions",
    "profile",
    "snapshots",
    "trades",
    "watchlist",
]
