"""Connection management and lazy schema initialization."""

from __future__ import annotations

import logging
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from threading import Lock

from .config import get_db_path
from .schema import SCHEMA_SQL
from .seed import seed_defaults

logger = logging.getLogger(__name__)

_initialized_paths: set[str] = set()
_init_lock = Lock()


def open_connection(path: Path | None = None) -> sqlite3.Connection:
    """Open a raw connection with WAL, foreign keys, and Row factory enabled.

    Does not initialize the schema. Prefer the `connection()` context manager.
    """
    db_path = path or get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def initialize_database(path: Path | None = None) -> None:
    """Create the schema and seed default data. Idempotent."""
    db_path = path or get_db_path()
    conn = open_connection(db_path)
    try:
        conn.executescript(SCHEMA_SQL)
        seed_defaults(conn)
        conn.commit()
    finally:
        conn.close()
    logger.info("Database ready at %s", db_path)


def ensure_initialized(path: Path | None = None) -> None:
    """Initialize the database the first time a given file is used in this process."""
    db_path = path or get_db_path()
    key = str(db_path)
    if key in _initialized_paths:
        return
    with _init_lock:
        if key not in _initialized_paths:
            initialize_database(db_path)
            _initialized_paths.add(key)


def reset_initialization_state() -> None:
    """Forget which files have been initialized. For tests that switch database paths."""
    with _init_lock:
        _initialized_paths.clear()


@contextmanager
def connection(path: Path | None = None) -> Iterator[sqlite3.Connection]:
    """Yield a ready-to-use connection, initializing the database on first use.

    Commits on clean exit, rolls back on exception, always closes.
    """
    db_path = path or get_db_path()
    ensure_initialized(db_path)
    conn = open_connection(db_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# `transaction` is the name callers use to group several repository calls atomically.
transaction = connection


@contextmanager
def session(conn: sqlite3.Connection | None) -> Iterator[sqlite3.Connection]:
    """Reuse a caller-supplied connection, or open and own a new one.

    Every repository function funnels through this so callers can opt into a
    shared transaction by passing `conn`.
    """
    if conn is not None:
        yield conn
    else:
        with connection() as owned:
            yield owned
