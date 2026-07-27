"""Tests for the profile repository."""

import pytest

from app.db import DEFAULT_CASH_BALANCE, DEFAULT_USER_ID
from app.db.repositories import profile


class TestProfile:
    """Cash balance access."""

    def test_get_profile_returns_seeded_defaults(self, db_path):
        result = profile.get_profile()
        assert result.id == DEFAULT_USER_ID
        assert result.cash_balance == DEFAULT_CASH_BALANCE
        assert result.created_at

    def test_get_profile_unknown_user_raises(self, db_path):
        with pytest.raises(ValueError, match="No profile"):
            profile.get_profile(user_id="nobody")

    def test_get_cash_balance(self, db_path):
        assert profile.get_cash_balance() == DEFAULT_CASH_BALANCE

    def test_set_cash_balance(self, db_path):
        updated = profile.set_cash_balance(2500.5)
        assert updated.cash_balance == 2500.5
        assert profile.get_cash_balance() == 2500.5

    def test_adjust_cash_balance_negative_delta(self, db_path):
        updated = profile.adjust_cash_balance(-1000.0)
        assert updated.cash_balance == DEFAULT_CASH_BALANCE - 1000.0

    def test_adjust_cash_balance_positive_delta(self, db_path):
        profile.adjust_cash_balance(250.25)
        assert profile.get_cash_balance() == DEFAULT_CASH_BALANCE + 250.25

    def test_adjust_allows_overdraft(self, db_path):
        """Validation is the caller's job; the layer stores what it is told."""
        updated = profile.adjust_cash_balance(-20000.0)
        assert updated.cash_balance == DEFAULT_CASH_BALANCE - 20000.0

    def test_to_dict(self, db_path):
        data = profile.get_profile().to_dict()
        assert data["id"] == DEFAULT_USER_ID
        assert data["cash_balance"] == DEFAULT_CASH_BALANCE
