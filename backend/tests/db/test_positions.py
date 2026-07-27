"""Tests for the positions repository."""

from app.db.repositories import positions


class TestPositions:
    """Position CRUD."""

    def test_empty_by_default(self, db_path):
        assert positions.list_positions() == []
        assert positions.get_position("AAPL") is None

    def test_upsert_creates_position(self, db_path):
        position = positions.upsert_position("AAPL", 10.0, 190.0)
        assert position.ticker == "AAPL"
        assert position.quantity == 10.0
        assert position.avg_cost == 190.0
        assert position.updated_at

    def test_upsert_overwrites_existing(self, db_path):
        first = positions.upsert_position("AAPL", 10.0, 190.0)
        second = positions.upsert_position("AAPL", 15.0, 195.0)
        assert second.id == first.id
        assert second.quantity == 15.0
        assert second.avg_cost == 195.0
        assert len(positions.list_positions()) == 1

    def test_fractional_shares(self, db_path):
        position = positions.upsert_position("NVDA", 0.375, 800.0)
        assert position.quantity == 0.375

    def test_ticker_is_normalized(self, db_path):
        positions.upsert_position(" nvda ", 1.0, 800.0)
        assert positions.get_position("NVDA") is not None
        assert positions.get_position("nvda") is not None

    def test_list_is_alphabetical(self, db_path):
        positions.upsert_position("TSLA", 1.0, 250.0)
        positions.upsert_position("AAPL", 1.0, 190.0)
        positions.upsert_position("MSFT", 1.0, 420.0)
        assert [p.ticker for p in positions.list_positions()] == ["AAPL", "MSFT", "TSLA"]

    def test_delete_position(self, db_path):
        positions.upsert_position("AAPL", 10.0, 190.0)
        assert positions.delete_position("AAPL") is True
        assert positions.get_position("AAPL") is None

    def test_delete_missing_returns_false(self, db_path):
        assert positions.delete_position("AAPL") is False

    def test_cost_basis(self, db_path):
        position = positions.upsert_position("AAPL", 3.0, 190.11)
        assert position.cost_basis == 570.33

    def test_to_dict_includes_cost_basis(self, db_path):
        data = positions.upsert_position("AAPL", 2.0, 100.0).to_dict()
        assert data["cost_basis"] == 200.0
        assert data["ticker"] == "AAPL"
