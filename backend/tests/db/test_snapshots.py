"""Tests for the portfolio snapshots repository."""

from app.db.repositories import snapshots


class TestSnapshots:
    """Recording and reading portfolio value history."""

    def test_empty_by_default(self, db_path):
        assert snapshots.list_snapshots() == []
        assert snapshots.latest_snapshot() is None

    def test_record_snapshot(self, db_path):
        snapshot = snapshots.record_snapshot(10500.25)
        assert snapshot.total_value == 10500.25
        assert snapshot.recorded_at

    def test_chronological_order(self, db_path):
        for value in (10000.0, 10100.0, 10200.0):
            snapshots.record_snapshot(value)
        assert [s.total_value for s in snapshots.list_snapshots()] == [10000.0, 10100.0, 10200.0]

    def test_limit_returns_most_recent_oldest_first(self, db_path):
        for value in (1.0, 2.0, 3.0, 4.0):
            snapshots.record_snapshot(value)
        assert [s.total_value for s in snapshots.list_snapshots(limit=2)] == [3.0, 4.0]

    def test_since_filter(self, db_path):
        first = snapshots.record_snapshot(1.0)
        snapshots.record_snapshot(2.0)
        result = snapshots.list_snapshots(since=first.recorded_at)
        assert [s.total_value for s in result] == [1.0, 2.0]

    def test_since_filter_excludes_older(self, db_path):
        snapshots.record_snapshot(1.0)
        second = snapshots.record_snapshot(2.0)
        result = snapshots.list_snapshots(since=second.recorded_at)
        assert [s.total_value for s in result] == [2.0]

    def test_latest_snapshot(self, db_path):
        snapshots.record_snapshot(1.0)
        snapshots.record_snapshot(2.0)
        assert snapshots.latest_snapshot().total_value == 2.0

    def test_to_dict(self, db_path):
        data = snapshots.record_snapshot(9999.0).to_dict()
        assert data["total_value"] == 9999.0
        assert set(data) == {"id", "user_id", "total_value", "recorded_at"}
