"""Tests for the chat messages repository."""

import pytest

from app.db.repositories import chat


class TestAddMessage:
    """Appending chat messages."""

    def test_add_user_message(self, db_path):
        message = chat.add_message("user", "What is my P&L?")
        assert message.role == "user"
        assert message.content == "What is my P&L?"
        assert message.actions is None
        assert message.created_at

    def test_add_assistant_message_with_actions(self, db_path):
        actions = {"trades": [{"ticker": "AAPL", "side": "buy", "quantity": 10}]}
        message = chat.add_message("assistant", "Bought 10 AAPL.", actions=actions)
        assert message.actions == actions

    def test_actions_round_trip_as_json(self, db_path):
        actions = {
            "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 1.5}],
            "watchlist_changes": [{"ticker": "PYPL", "action": "add"}],
        }
        chat.add_message("assistant", "Done.", actions=actions)
        assert chat.list_messages()[0].actions == actions

    def test_invalid_role_raises(self, db_path):
        with pytest.raises(ValueError, match="role must be"):
            chat.add_message("system", "nope")


class TestListMessages:
    """Reading conversation history."""

    def test_empty_by_default(self, db_path):
        assert chat.list_messages() == []

    def test_chronological_order(self, db_path):
        chat.add_message("user", "one")
        chat.add_message("assistant", "two")
        chat.add_message("user", "three")
        assert [m.content for m in chat.list_messages()] == ["one", "two", "three"]

    def test_limit_returns_most_recent_oldest_first(self, db_path):
        for text in ("one", "two", "three", "four"):
            chat.add_message("user", text)
        assert [m.content for m in chat.list_messages(limit=2)] == ["three", "four"]

    def test_clear_messages(self, db_path):
        chat.add_message("user", "one")
        chat.add_message("assistant", "two")
        assert chat.clear_messages() == 2
        assert chat.list_messages() == []

    def test_clear_empty_returns_zero(self, db_path):
        assert chat.clear_messages() == 0

    def test_to_dict(self, db_path):
        data = chat.add_message("user", "hi").to_dict()
        assert data["role"] == "user"
        assert data["actions"] is None
        assert set(data) == {"id", "user_id", "role", "content", "actions", "created_at"}
