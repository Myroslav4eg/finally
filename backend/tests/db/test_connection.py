"""Tests for connection management, lazy initialization, and seed data."""

import sqlite3

import pytest

from app.db.config import DEFAULT_CASH_BALANCE, DEFAULT_TICKERS, DEFAULT_USER_ID, get_db_path
from app.db.connection import connection, initialize_database, open_connection

TABLES = {
    "users_profile",
    "watchlist",
    "positions",
    "trades",
    "portfolio_snapshots",
    "chat_messages",
}


def table_names(conn) -> set[str]:
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    return {row["name"] for row in rows}


class TestInitialization:
    """Schema creation and seeding."""

    def test_env_var_overrides_db_path(self, db_path):
        assert get_db_path() == db_path

    def test_creates_file_and_tables(self, db_path):
        initialize_database()
        assert db_path.exists()
        with connection() as conn:
            assert TABLES <= table_names(conn)

    def test_creates_parent_directory(self, tmp_path, monkeypatch):
        from app.db.config import DB_PATH_ENV_VAR
        from app.db.connection import reset_initialization_state

        nested = tmp_path / "nested" / "dir" / "finally.db"
        monkeypatch.setenv(DB_PATH_ENV_VAR, str(nested))
        reset_initialization_state()
        initialize_database()
        assert nested.exists()

    def test_seeds_profile(self, db_path):
        with connection() as conn:
            row = conn.execute(
                "SELECT * FROM users_profile WHERE id = ?", (DEFAULT_USER_ID,)
            ).fetchone()
        assert row["cash_balance"] == DEFAULT_CASH_BALANCE
        assert row["created_at"]

    def test_seeds_default_watchlist(self, db_path):
        with connection() as conn:
            rows = conn.execute("SELECT ticker FROM watchlist").fetchall()
        assert {row["ticker"] for row in rows} == set(DEFAULT_TICKERS)

    def test_initialization_is_idempotent(self, db_path):
        initialize_database()
        with connection() as conn:
            conn.execute(
                "UPDATE users_profile SET cash_balance = 42.0 WHERE id = ?", (DEFAULT_USER_ID,)
            )
        initialize_database()
        with connection() as conn:
            row = conn.execute(
                "SELECT cash_balance FROM users_profile WHERE id = ?", (DEFAULT_USER_ID,)
            ).fetchone()
            count = conn.execute("SELECT COUNT(*) AS n FROM watchlist").fetchone()["n"]
        assert row["cash_balance"] == 42.0
        assert count == len(DEFAULT_TICKERS)

    def test_lazy_init_on_first_connection(self, db_path):
        assert not db_path.exists()
        with connection() as conn:
            assert TABLES <= table_names(conn)


class TestConnection:
    """Connection behavior."""

    def test_wal_mode_enabled(self, db_path):
        with connection() as conn:
            mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        assert mode.lower() == "wal"

    def test_foreign_keys_enabled(self, db_path):
        with connection() as conn:
            assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1

    def test_row_factory_is_row(self, db_path):
        with connection() as conn:
            row = conn.execute("SELECT 1 AS one").fetchone()
        assert isinstance(row, sqlite3.Row)
        assert row["one"] == 1

    def test_commits_on_clean_exit(self, db_path):
        with connection() as conn:
            conn.execute("UPDATE users_profile SET cash_balance = 5.0")
        with connection() as conn:
            assert conn.execute("SELECT cash_balance FROM users_profile").fetchone()[0] == 5.0

    def test_rolls_back_on_exception(self, db_path):
        with pytest.raises(RuntimeError):
            with connection() as conn:
                conn.execute("UPDATE users_profile SET cash_balance = 5.0")
                raise RuntimeError("boom")
        with connection() as conn:
            balance = conn.execute("SELECT cash_balance FROM users_profile").fetchone()[0]
        assert balance == DEFAULT_CASH_BALANCE

    def test_open_connection_does_not_initialize(self, db_path):
        conn = open_connection()
        try:
            assert not TABLES & table_names(conn)
        finally:
            conn.close()


class TestConstraints:
    """Schema-level constraints."""

    def test_watchlist_ticker_is_unique_per_user(self, db_path):
        with pytest.raises(sqlite3.IntegrityError):
            with connection() as conn:
                conn.execute(
                    "INSERT INTO watchlist (id, user_id, ticker, added_at) VALUES (?, ?, ?, ?)",
                    ("dup", DEFAULT_USER_ID, "AAPL", "2026-01-01T00:00:00+00:00"),
                )

    def test_positions_ticker_is_unique_per_user(self, db_path):
        row = ("p1", DEFAULT_USER_ID, "AAPL", 1.0, 100.0, "2026-01-01T00:00:00+00:00")
        with connection() as conn:
            conn.execute(
                "INSERT INTO positions (id, user_id, ticker, quantity, avg_cost, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                row,
            )
        with pytest.raises(sqlite3.IntegrityError):
            with connection() as conn:
                conn.execute(
                    "INSERT INTO positions (id, user_id, ticker, quantity, avg_cost, updated_at)"
                    " VALUES (?, ?, ?, ?, ?, ?)",
                    ("p2",) + row[1:],
                )

    def test_trade_side_is_constrained(self, db_path):
        with pytest.raises(sqlite3.IntegrityError):
            with connection() as conn:
                conn.execute(
                    "INSERT INTO trades (id, user_id, ticker, side, quantity, price, executed_at)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?)",
                    ("t1", DEFAULT_USER_ID, "AAPL", "hold", 1.0, 100.0, "2026-01-01T00:00:00+00:00"),
                )

    def test_chat_role_is_constrained(self, db_path):
        with pytest.raises(sqlite3.IntegrityError):
            with connection() as conn:
                conn.execute(
                    "INSERT INTO chat_messages (id, user_id, role, content, actions, created_at)"
                    " VALUES (?, ?, ?, ?, ?, ?)",
                    ("c1", DEFAULT_USER_ID, "system", "hi", None, "2026-01-01T00:00:00+00:00"),
                )
