"""Fixtures pointing the database layer at a temporary file."""

import pytest

from app.db.config import DB_PATH_ENV_VAR
from app.db.connection import reset_initialization_state


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    """Point FINALLY_DB_PATH at a fresh temporary database file for each test."""
    path = tmp_path / "test.db"
    monkeypatch.setenv(DB_PATH_ENV_VAR, str(path))
    reset_initialization_state()
    yield path
    reset_initialization_state()
